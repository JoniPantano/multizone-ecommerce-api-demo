require('dotenv').config();

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
};

const parseNumber = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const parseCsv = (value, defaultValue = []) => {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

module.exports = {
  app: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    publicUrl: process.env.PUBLIC_API_URL || null,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    corsAllowedOrigins: parseCsv(process.env.CORS_ALLOWED_ORIGINS, []),
    exposeVerificationCode:
      parseBoolean(process.env.EXPOSE_VERIFICATION_CODE, false) ||
      (process.env.NODE_ENV || 'development') === 'development'
  },
  database: {
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'Database_Multizona'
  },
  swagger: {
    title: 'Multizona E-Commerce API',
    description: 'API documentation for local e-commerce with multi-zone support',
    version: '1.0.0'
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    maxVerificationRequests: parseNumber(process.env.MAX_VERIFICATION_REQUESTS, 4),
    verificationRequestWindowMs: parseNumber(process.env.VERIFICATION_REQUEST_WINDOW_MS, 60 * 1000)
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: process.env.RESEND_FROM || 'onboarding@resend.dev'
  },
  mercadoPago: {
    accessToken: process.env.MP_ACCESS_TOKEN || '',
    publicKey: process.env.MP_PUBLIC_KEY || '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET || '',
    webhookUrl: process.env.MP_WEBHOOK_URL || '',
    successUrl: process.env.MP_SUCCESS_URL || '',
    failureUrl: process.env.MP_FAILURE_URL || '',
    pendingUrl: process.env.MP_PENDING_URL || '',
    currency: process.env.MP_CURRENCY || 'ARS',
    baseUrl: process.env.MP_API_BASE_URL || 'https://api.mercadopago.com',
    excludedPaymentTypeIds: parseCsv(process.env.MP_EXCLUDED_PAYMENT_TYPE_IDS, ['ticket', 'atm']),
    excludedPaymentMethodIds: parseCsv(process.env.MP_EXCLUDED_PAYMENT_METHOD_IDS, [])
  },
  orders: {
    idempotencyTtlHours: parseNumber(process.env.ORDER_IDEMPOTENCY_TTL_HOURS, 24),
    pendingTtlMinutes: parseNumber(process.env.ORDER_PENDING_TTL_MINUTES, 60)
  },
  security: {
    authRateLimitWindowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    authRateLimitMax: parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 50),
    orderRateLimitWindowMs: parseNumber(process.env.ORDER_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000),
    orderRateLimitMax: parseNumber(process.env.ORDER_RATE_LIMIT_MAX, 60),
    webhookRateLimitWindowMs: parseNumber(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    webhookRateLimitMax: parseNumber(process.env.WEBHOOK_RATE_LIMIT_MAX, 120)
  }
};
