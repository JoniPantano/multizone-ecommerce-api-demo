const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/PaymentController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

const paymentController = new PaymentController();

/**
 * @swagger
 * /api/payments/config:
 *   get:
 *     tags: [Payments]
 *     summary: Get public payment config
 *     description: Returns public payment configuration for frontend initialization.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Payment configuration retrieved successfully
 */
router.get('/config', authenticateToken, (req, res) => paymentController.getPublicConfig(req, res));

/**
 * @swagger
 * /api/payments/reconcile-pending:
 *   post:
 *     tags: [Payments]
 *     summary: Reconcile pending Mercado Pago payments
 *     description: Admin-only endpoint to sync pending payment statuses from Mercado Pago.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *     responses:
 *       200:
 *         description: Pending payment reconciliation completed
 *       400:
 *         description: Mercado Pago not configured
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Reconciliation failed
 */
router.post('/reconcile-pending', authenticateToken, authorizeRoles('admin'), (req, res) =>
  paymentController.reconcilePendingPayments(req, res)
);

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Mercado Pago webhook
 *     description: Receives Mercado Pago asynchronous payment notifications and updates payment status.
 *     security: []
 *     responses:
 *       200:
 *         description: Webhook processed
 *       202:
 *         description: Webhook received but ignored
 *       500:
 *         description: Webhook processing failed
 */
router.post('/webhook', (req, res) => paymentController.webhook(req, res));

module.exports = router;
