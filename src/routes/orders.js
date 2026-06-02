const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

const orderController = new OrderController();

/**
 * @swagger
 * /api/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create order from cart
 *     description: Creates an order using the authenticated user's current cart items.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Order created successfully
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
 *                   example: "Order created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     allowedStatuses:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["pending", "delivered", "cancelled"]
 *                     paymentStatus:
 *                       type: string
 *                       example: "preference_created"
 *                     payment:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: "mercadopago"
 *                         configured:
 *                           type: boolean
 *                           example: true
 *                         preferenceId:
 *                           type: string
 *                           nullable: true
 *                           example: "123456789-abcdef"
 *                         initPoint:
 *                           type: string
 *                           nullable: true
 *                           example: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
 *                         sandboxInitPoint:
 *                           type: string
 *                           nullable: true
 *                           example: "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
 *                         message:
 *                           type: string
 *                           nullable: true
 *                           example: "Mercado Pago credentials are not configured yet"
 *                     total:
 *                       type: number
 *                       example: 200
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 1
 *                           productName:
 *                             type: string
 *                             example: "Yerba Mate 1kg"
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *       400:
 *         description: Cart empty, stock issue, or invalid request
 *       409:
 *         description: Duplicate order attempt or concurrent stock update conflict
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticateToken, (req, res) => orderController.createOrder(req, res));

/**
 * @swagger
 * /api/orders/direct:
 *   post:
 *     tags: [Orders]
 *     summary: Create direct order for one product
 *     description: Creates an order and payment preference for a single product without using cart.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Clave de idempotencia para evitar ordenes duplicadas por reintento.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 1
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 2
 *               idempotencyKey:
 *                 type: string
 *                 example: "direct-20260522-0001"
 *                 description: Alternativa al header Idempotency-Key.
 *     responses:
 *       201:
 *         description: Direct order created successfully
 *       400:
 *         description: Invalid payload or stock issue
 *       403:
 *         description: Product outside user's zone
 *       404:
 *         description: Product not found
 *       409:
 *         description: Concurrent stock conflict
 *       500:
 *         description: Internal server error
 */
router.post('/direct', authenticateToken, (req, res) => orderController.createDirectOrder(req, res));

/**
 * @swagger
 * /api/orders/current-pending-payment:
 *   get:
 *     tags: [Orders]
 *     summary: Get current pending payment order
 *     description: Returns the latest pending order for the authenticated user with payment init point to continue checkout.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Pending order retrieved successfully or no pending order found
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/current-pending-payment', authenticateToken, (req, res) =>
  orderController.getCurrentPendingPaymentOrder(req, res)
);

/**
 * @swagger
 * /api/orders/current-pending-payment/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel current pending payment order
 *     description: Cancels the latest pending payment order of the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Pending order cancelled successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: No active pending payment order found
 *       409:
 *         description: Order cannot be cancelled from this endpoint
 *       500:
 *         description: Internal server error
 */
router.post('/current-pending-payment/cancel', authenticateToken, (req, res) =>
  orderController.cancelCurrentPendingPaymentOrder(req, res)
);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get all orders
 *     description: Retrieve a list of all orders
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
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
 *                   example: "Orders retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       status:
 *                         type: string
 *                         example: "pending"
 *                       allowedStatuses:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["pending", "delivered", "cancelled"]
 *                       total:
 *                         type: number
 *                         example: 200
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       items:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             productId:
 *                               type: integer
 *                               example: 1
 *                             productName:
 *                               type: string
 *                               example: "Yerba Mate 1kg"
 *                             quantity:
 *                               type: integer
 *                               example: 2
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticateToken, (req, res) => orderController.getOrders(req, res));

/**
 * @swagger
 * /api/orders/{id}/payment-status:
 *   get:
 *     tags: [Orders]
 *     summary: Get order payment status
 *     description: Returns payment status details for a single order. Customers can access their own orders; admin/seller can access same-zone orders.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order payment status retrieved successfully
 *       400:
 *         description: Invalid order ID
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id/payment-status', authenticateToken, (req, res) => orderController.getOrderPaymentStatus(req, res));

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     tags: [Orders]
 *     summary: Update order status
 *     description: "Updates an order status. Allowed transitions: pending to delivered or cancelled."
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, delivered, cancelled]
 *                 example: delivered
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       400:
 *         description: Invalid request payload
 *       403:
 *         description: Order belongs to another zone
 *       404:
 *         description: Order not found
 *       409:
 *         description: Invalid transition
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/status', authenticateToken, authorizeRoles('admin'), (req, res) => orderController.updateOrderStatus(req, res));

module.exports = router;
