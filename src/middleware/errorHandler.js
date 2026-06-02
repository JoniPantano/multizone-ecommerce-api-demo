// Error handling middleware
const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor';
  const requestId = req?.requestId || req?.headers?.['x-request-id'] || 'sin-request-id';

  console.error(`[${new Date().toISOString()}] [req:${requestId}] ${status} - ${message}`);

  res.status(status).json({
    success: false,
    requestId,
    error: {
      status,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

module.exports = errorHandler;
