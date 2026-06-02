const jwt = require('jsonwebtoken');
const config = require('../config/config');
const jwtSecret = config.auth.jwtSecret || 'dev-insecure-secret';

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Falta el token de autenticación'
    });
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }

    req.user = decoded;
    next();
  });
}

function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }

    req.user = decoded;
    return next();
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticación requerida'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No tenés permisos para realizar esta acción'
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  optionalAuthenticateToken,
  authorizeRoles
};
