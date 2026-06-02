const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');

const authController = new AuthController();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Request user registration
 *     description: Send an email verification code. The user account is created only after the code is verified.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@test.com"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "password123"
 *               zoneId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       202:
 *         description: Verification code sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Verification code sent. Complete email verification to create the account."
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: "test@test.com"
 *                     zoneId:
 *                       type: integer
 *                       example: 1
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     verificationCode:
 *                       type: string
 *                       example: "123456"
 *                       description: Development only. Returned when NODE_ENV=development.
 *       400:
 *         description: Bad request - missing required fields
 *       409:
 *         description: User already exists
 *       429:
 *         description: Too many verification requests
 *       500:
 *         description: Internal server error
 */
router.post('/register', (req, res) => authController.register(req, res));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user
 *     description: Authenticate user and return JWT token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - zoneId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@test.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               zoneId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       example: "mock-jwt-token"
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         email:
 *                           type: string
 *                           example: "test@test.com"
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Invalid credentials, zone mismatch, or unverified email
 *       500:
 *         description: Internal server error
 */
router.post('/login', (req, res) => authController.login(req, res));

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email with code
 *     description: Verify the email code and create the user account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@test.com"
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Email verified successfully. Account created."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     email:
 *                       type: string
 *                       example: "test@test.com"
 *                     zoneId:
 *                       type: integer
 *                       example: 1
 *                     role:
 *                       type: string
 *                       example: "customer"
 *       400:
 *         description: Bad request - missing required fields or invalid code
 *       404:
 *         description: Pending registration not found
 *       500:
 *         description: Internal server error
 */
router.post('/verify-email', (req, res) => authController.verifyEmail(req, res));

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification code
 *     description: Resend email verification code (rate limited by request window policy)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@test.com"
 *     responses:
 *       200:
 *         description: Verification code sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Verification code sent successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: "test@test.com"
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     verificationCode:
 *                       type: string
 *                       example: "123456"
 *                       description: Development only. Returned when NODE_ENV=development.
 *       400:
 *         description: Bad request - missing required fields
 *       404:
 *         description: Pending registration not found
 *       429:
 *         description: Too many requests - wait before resending
 *       500:
 *         description: Internal server error
 */
router.post('/resend-verification', (req, res) => authController.resendVerificationCode(req, res));

module.exports = router;
