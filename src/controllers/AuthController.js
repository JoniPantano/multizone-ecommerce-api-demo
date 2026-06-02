const BaseController = require('./BaseController');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const prisma = require('../config/prisma');
const config = require('../config/config');
const jwtSecret = config.auth.jwtSecret || 'dev-insecure-secret';

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_VERIFICATION_REQUESTS = Math.max(1, Number(config.auth.maxVerificationRequests) || 4);
const VERIFICATION_REQUEST_WINDOW_MS = Math.max(1000, Number(config.auth.verificationRequestWindowMs) || 60 * 1000);

/**
 * Auth Controller - Handles authentication operations
 * Uses Prisma for database access
 */
class AuthController extends BaseController {
  /**
   * Create a pending registration request.
   * The user account is created only after a valid email code is verified.
   */
  async register(req, res) {
    try {
      const { email, password, zoneId } = req.body;
      const normalizedEmail = this.normalizeEmail(email);

      const validation = this.validateRequired(req.body, ['email', 'password']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      if (!this.isEmail(normalizedEmail)) {
        return this.sendError(res, 'Formato de email inválido', 400);
      }

      if (!this.isNonEmptyString(password) || password.length < 6) {
        return this.sendError(res, 'Password must be at least 6 characters', 400);
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingUser) {
        return this.sendError(res, 'El usuario ya existe', 409);
      }

      const userZoneId = await this.resolveZoneId(zoneId);
      if (!userZoneId) {
        return this.sendError(res, 'Zona no encontrada', 400);
      }

      const recentRequestsCount = await prisma.pendingRegistration.count({
        where: {
          email: normalizedEmail,
          createdAt: {
            gt: new Date(Date.now() - VERIFICATION_REQUEST_WINDOW_MS)
          }
        },
      });

      if (recentRequestsCount >= MAX_VERIFICATION_REQUESTS) {
        return this.sendError(
          res,
          `Too many verification requests. Maximum ${MAX_VERIFICATION_REQUESTS} per ${Math.ceil(VERIFICATION_REQUEST_WINDOW_MS / 1000)} seconds.`,
          429
        );
      }

      const verificationCode = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
      const passwordHash = await bcrypt.hash(password, 10);
      const codeHash = await bcrypt.hash(verificationCode, 10);

      const pendingRegistration = await prisma.$transaction(async (tx) => {
        await tx.pendingRegistration.updateMany({
          where: {
            email: normalizedEmail,
            usedAt: null
          },
          data: {
            usedAt: new Date()
          }
        });

        return tx.pendingRegistration.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            zoneId: userZoneId,
            codeHash,
            expiresAt
          }
        });
      });

      let emailDelivery = 'enviado';
      try {
        await this.sendVerificationEmail(normalizedEmail, verificationCode);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);

        if (!config.app.exposeVerificationCode) {
          await prisma.pendingRegistration.delete({
            where: { id: pendingRegistration.id },
          });
          return this.sendError(res, 'No se pudo enviar el correo de verificación. Intentá nuevamente más tarde.', 500);
        }

        emailDelivery = 'fallido';
      }

      return this.sendSuccess(
        res,
        {
          email: normalizedEmail,
          zoneId: userZoneId,
          expiresAt,
          emailDelivery,
          ...(config.app.exposeVerificationCode && { verificationCode })
        },
        'Código de verificación enviado. Completá la verificación para crear la cuenta.',
        202
      );
    } catch (error) {
      if (error.message === 'INVALID_ZONE_ID') {
        return this.sendError(res, 'zoneId debe ser un número entero positivo', 400);
      }

      return this.sendError(res, 'Registration failed', 500, error);
    }
  }

  /**
   * Login user
   */
  async login(req, res) {
    try {
      const { email, password, zoneId } = req.body;
      const normalizedEmail = this.normalizeEmail(email);

      const validation = this.validateRequired(req.body, ['email', 'password', 'zoneId']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      if (!this.isEmail(normalizedEmail)) {
        return this.sendError(res, 'Formato de email inválido', 400);
      }

      const parsedZoneId = Number(zoneId);
      if (!Number.isInteger(parsedZoneId) || parsedZoneId <= 0) {
        return this.sendError(res, 'zoneId debe ser un número entero positivo', 400);
      }

      const zone = await prisma.zone.findUnique({
        where: { id: parsedZoneId }
      });

      if (!zone) {
        return this.sendError(res, 'Zona no encontrada', 400);
      }

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (!user) {
        return this.sendError(res, 'Credenciales inválidas', 401);
      }

      if (user.zoneId !== parsedZoneId) {
        return this.sendError(res, 'Credenciales inválidas para la zona seleccionada', 401);
      }

      const passwordMatches = await bcrypt.compare(password, user.password);
      if (!passwordMatches) {
        return this.sendError(res, 'Credenciales inválidas', 401);
      }

      if (!user.emailVerified) {
        return this.sendError(res, 'Verificá tu email antes de iniciar sesión', 401);
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          zoneId: user.zoneId
        },
        jwtSecret,
        { expiresIn: config.auth.jwtExpiresIn }
      );

      return this.sendSuccess(
        res,
        {
          token,
          user: {
            id: user.id,
            email: user.email,
            zoneId: user.zoneId,
            role: user.role
          }
        },
        'Inicio de sesión exitoso'
      );
    } catch (error) {
      console.error('LOGIN ERROR:', error);
      return this.sendError(res, 'No se pudo iniciar sesión', 500, error.message || error);
    }
  }

  /**
   * Verify email with code and create the user account.
   */
  async verifyEmail(req, res) {
    try {
      const { email, code } = req.body;
      const normalizedEmail = this.normalizeEmail(email);

      const validation = this.validateRequired(req.body, ['email', 'code']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      if (!this.isEmail(normalizedEmail)) {
        return this.sendError(res, 'Formato de email inválido', 400);
      }

      if (!/^\d{6}$/.test(String(code))) {
        return this.sendError(res, 'Código de verificación inválido o expirado', 400);
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingUser) {
        return this.sendError(res, 'El email ya fue verificado', 400);
      }

      const pendingRegistration = await prisma.pendingRegistration.findFirst({
        where: {
          email: normalizedEmail,
          usedAt: null,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!pendingRegistration) {
        return this.sendError(res, 'Código de verificación inválido o expirado', 400);
      }

      if (pendingRegistration.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        await prisma.pendingRegistration.update({
          where: { id: pendingRegistration.id },
          data: { usedAt: new Date() }
        });

        return this.sendError(res, 'Demasiados intentos inválidos. Solicitá un nuevo código.', 429);
      }

      const codeMatches = await bcrypt.compare(String(code), pendingRegistration.codeHash);
      if (!codeMatches) {
        const attempts = pendingRegistration.attempts + 1;
        const reachedAttemptLimit = attempts >= MAX_VERIFICATION_ATTEMPTS;

        await prisma.pendingRegistration.update({
          where: { id: pendingRegistration.id },
          data: {
            attempts,
            ...(reachedAttemptLimit && { usedAt: new Date() })
          }
        });

        if (reachedAttemptLimit) {
          return this.sendError(res, 'Demasiados intentos inválidos. Solicitá un nuevo código.', 429);
        }

        return this.sendError(res, 'Código de verificación inválido o expirado', 400);
      }

      let createdUser;
      try {
        createdUser = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: pendingRegistration.email,
              password: pendingRegistration.passwordHash,
              zoneId: pendingRegistration.zoneId,
              role: 'customer',
              emailVerified: true
            }
          });

          await tx.pendingRegistration.deleteMany({
            where: {
              email: normalizedEmail
            }
          });

          return user;
        });
      } catch (error) {
        if (error.code === 'P2002') {
          return this.sendError(res, 'El email ya fue verificado', 400);
        }
        throw error;
      }

      return this.sendSuccess(
        res,
        {
          id: createdUser.id,
          email: createdUser.email,
          zoneId: createdUser.zoneId,
          role: createdUser.role
        },
        'Email verificado correctamente. Cuenta creada.'
      );
    } catch (error) {
      return this.sendError(res, 'Verification failed', 500, error);
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email, code) {
    if (!config.email.resendApiKey) {
      throw new Error('Missing RESEND_API_KEY');
    }

    const resend = new Resend(config.email.resendApiKey);

    const { error } = await resend.emails.send({
      from: config.email.from,
      to: email,
      subject: 'Verify your email - Multizona E-Commerce',
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code will expire in 15 minutes.</p>`
    });

    if (error) {
      throw new Error(error.message || 'Resend send failed');
    }

    if (config.app.env === 'development') {
      console.log('Verification code:', code);
    }
  }

  /**
   * Resend verification code for the latest pending registration.
   */
  async resendVerificationCode(req, res) {
    try {
      const { email } = req.body;
      const normalizedEmail = this.normalizeEmail(email);

      const validation = this.validateRequired(req.body, ['email']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      if (!this.isEmail(normalizedEmail)) {
        return this.sendError(res, 'Formato de email inválido', 400);
      }

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (user) {
        return this.sendError(res, 'El email ya fue verificado', 400);
      }

      const latestPendingRegistration = await prisma.pendingRegistration.findFirst({
        where: {
          email: normalizedEmail,
          usedAt: null,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!latestPendingRegistration) {
        return this.sendError(res, 'No se encontró un registro pendiente para este email', 404);
      }

      const recentRequestsCount = await prisma.pendingRegistration.count({
        where: {
          email: normalizedEmail,
          createdAt: {
            gt: new Date(Date.now() - VERIFICATION_REQUEST_WINDOW_MS)
          }
        }
      });

      if (recentRequestsCount >= MAX_VERIFICATION_REQUESTS) {
        return this.sendError(
          res,
          `Too many verification requests. Maximum ${MAX_VERIFICATION_REQUESTS} per ${Math.ceil(VERIFICATION_REQUEST_WINDOW_MS / 1000)} seconds.`,
          429
        );
      }

      const verificationCode = this.generateVerificationCode();
      const codeHash = await bcrypt.hash(verificationCode, 10);
      const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

      const pendingRegistration = await prisma.$transaction(async (tx) => {
        await tx.pendingRegistration.updateMany({
          where: {
            email: normalizedEmail,
            usedAt: null
          },
          data: {
            usedAt: new Date()
          }
        });

        return tx.pendingRegistration.create({
          data: {
            email: latestPendingRegistration.email,
            passwordHash: latestPendingRegistration.passwordHash,
            zoneId: latestPendingRegistration.zoneId,
            codeHash,
            expiresAt
          }
        });
      });

      let emailDelivery = 'enviado';
      try {
        await this.sendVerificationEmail(normalizedEmail, verificationCode);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);

        if (!config.app.exposeVerificationCode) {
          await prisma.pendingRegistration.delete({
            where: { id: pendingRegistration.id },
          });
          return this.sendError(res, 'No se pudo enviar el correo de verificación. Intentá nuevamente más tarde.', 500);
        }

        emailDelivery = 'fallido';
      }

      return this.sendSuccess(
        res,
        {
          email: normalizedEmail,
          expiresAt,
          emailDelivery,
          ...(config.app.exposeVerificationCode && { verificationCode })
        },
        'Código de verificación enviado correctamente'
      );
    } catch (error) {
      return this.sendError(res, 'No se pudo reenviar el código de verificación', 500, error);
    }
  }

  normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : email;
  }

  generateVerificationCode() {
    return crypto.randomInt(100000, 1000000).toString();
  }

  async resolveZoneId(zoneId) {
    if (zoneId !== undefined) {
      const parsedZoneId = Number(zoneId);
      if (!Number.isInteger(parsedZoneId) || parsedZoneId <= 0) {
        throw new Error('INVALID_ZONE_ID');
      }

      const zone = await prisma.zone.findUnique({
        where: { id: parsedZoneId }
      });

      if (zone) {
        return parsedZoneId;
      }

      // Fresh environments can have an empty zones table.
      // For QA compatibility, auto-create default zone only for requested zoneId=1.
      if (parsedZoneId === 1) {
        const existingZone = await prisma.zone.findFirst();
        if (existingZone) {
          return null;
        }

        const defaultZone = await prisma.zone.create({
          data: {
            name: 'Default Zone',
            description: 'Zona por defecto'
          }
        });

        return defaultZone.id;
      }

      return null;
    }

    let defaultZone = await prisma.zone.findFirst();
    if (!defaultZone) {
      defaultZone = await prisma.zone.create({
        data: {
          name: 'Default Zone',
          description: 'Zona por defecto'
        }
      });
    }

    return defaultZone.id;
  }
}

module.exports = AuthController;
