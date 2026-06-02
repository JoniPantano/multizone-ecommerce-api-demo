const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const config = require('./config/config');
const swaggerSpec = require('./config/swagger');
const requestLogger = require('./middleware/requestLogger');
const { createRateLimiter } = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const cartRoutes = require('./routes/cart');
const paymentRoutes = require('./routes/payments');
      
const app = express();
const PORT = config.app.port;

const resolveAllowedOrigins = () => {
  if (config.app.corsOrigin === '*') return '*';
  if (Array.isArray(config.app.corsAllowedOrigins) && config.app.corsAllowedOrigins.length > 0) {
    return config.app.corsAllowedOrigins;
  }
  return config.app.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
};

const allowedOrigins = resolveAllowedOrigins();
const corsOptions = {
  credentials: allowedOrigins !== '*',
  origin: (origin, callback) => {
    if (allowedOrigins === '*') return callback(null, true);
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  }
};

if (!config.auth.jwtSecret) {
  if (config.app.env === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  console.warn('[config] JWT_SECRET is not set. Using insecure development fallback.');
}

// Proxy para documentación Swagger en producción
app.set('trust proxy', 1);

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

const authRateLimiter = createRateLimiter({
  windowMs: config.security.authRateLimitWindowMs,
  max: config.security.authRateLimitMax,
  message: 'Demasiados intentos de autenticación, intenta nuevamente más tarde'
});
const orderRateLimiter = createRateLimiter({
  windowMs: config.security.orderRateLimitWindowMs,
  max: config.security.orderRateLimitMax,
  message: 'Demasiadas operaciones de compra, intenta nuevamente más tarde'
});
const webhookRateLimiter = createRateLimiter({
  windowMs: config.security.webhookRateLimitWindowMs,
  max: config.security.webhookRateLimitMax,
  message: 'Demasiados eventos de webhook en poco tiempo'
});

// Swagger documentacion
app.get('/api-docs.json', (req, res) => {
  const requestPublicUrl = `${req.protocol}://${req.get('host')}`;
  const publicUrl = config.app.publicUrl || requestPublicUrl;

  res.json({
    ...swaggerSpec,
    servers: [
      {
        url: publicUrl,
        description: config.app.publicUrl ? 'Configured public server' : 'Current request server'
      },
      {
        url: `http://localhost:${PORT}`,
        description: 'Local development server'
      }
    ]
  });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true,
    url: '/api-docs.json'
  }
}));

// Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRateLimiter, orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/payments/webhook', webhookRateLimiter);
app.use('/api/payments', paymentRoutes);

// Root endpoint
/**
 * @swagger
 * /:
 *   get:
 *     tags:
 *       - Root
 *     summary: API Root
 *     description: Welcome message
 *     responses:
 *       200:
 *         description: Welcome message
 */
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Multizona E-Commerce API',
    version: '1.0.0',
    documentation: '/api-docs',
    publicUrl: config.app.publicUrl
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
    ╔════════════════════════════════════════╗
    ║   Multizona E-Commerce API Started    ║
    ║   Port: ${PORT}                          ║
    ║   Environment: ${config.app.env}                 ║
    ║   Swagger: http://localhost:${PORT}/api-docs ║
    ╚════════════════════════════════════════╝
  `);
});

module.exports = app;
