function createRateLimiter(options) {
  const windowMs = Math.max(1000, Number(options?.windowMs) || 60 * 1000);
  const max = Math.max(1, Number(options?.max) || 60);
  const message = options?.message || 'Demasiadas solicitudes, intenta nuevamente más tarde';
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl || ''}`;

    const existing = store.get(key);
    if (!existing || now > existing.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count <= max) {
      return next();
    }

    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      success: false,
      message
    });
  };
}

module.exports = {
  createRateLimiter
};
