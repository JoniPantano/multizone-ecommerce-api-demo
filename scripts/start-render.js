const { spawnSync } = require('child_process');

const MAX_ATTEMPTS = Number(process.env.MIGRATE_RETRY_ATTEMPTS || 8);
const RETRY_DELAY_MS = Number(process.env.MIGRATE_RETRY_DELAY_MS || 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
}

async function runMigrationsWithRetry() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`[startup] Running migrations (attempt ${attempt}/${MAX_ATTEMPTS})...`);
    const result = run('npx', ['prisma', 'migrate', 'deploy']);

    if (result.status === 0) {
      console.log('[startup] Migrations applied successfully.');
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(`[startup] Migration failed. Retrying in ${RETRY_DELAY_MS}ms...`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    console.error('[startup] Migration failed after maximum retry attempts.');
    process.exit(result.status || 1);
  }
}

async function main() {
  await runMigrationsWithRetry();
  const server = run('node', ['src/app.js']);
  process.exit(server.status || 1);
}

main();
