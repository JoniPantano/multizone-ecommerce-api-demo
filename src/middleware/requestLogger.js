const crypto = require('crypto');

const sanitizePath = (pathValue) => {
  if (!pathValue) return '/';
  return String(pathValue).split('?')[0];
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const safePath = sanitizePath(req.originalUrl || req.url || req.path);
    console.log(
      `[${new Date().toISOString()}] [req:${requestId}] ${req.method} ${safePath} - ${res.statusCode} (${duration}ms)`
    );
  });

  next();
};

module.exports = requestLogger;
