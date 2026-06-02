const express = require('express');
const router = express.Router();
const CartController = require('../controllers/CartController');
const { authenticateToken } = require('../middleware/authMiddleware');

const cartController = new CartController();

/**
 * @swagger
 * /api/cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get cart contents
 *     description: Retrieve the current shopping cart contents
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cart retrieved successfully
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
 *                   example: "Cart retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 1
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           name:
 *                             type: string
 *                             example: "Producto ejemplo"
 *                           price:
 *                             type: number
 *                             example: 100
 *                     total:
 *                       type: number
 *                       example: 200
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticateToken, (req, res) => cartController.getCart(req, res));

/**
 * @swagger
 * /api/cart/add:
 *   post:
 *     tags: [Cart]
 *     summary: Add item to cart
 *     description: Add a product to the shopping cart
 *     security:
 *       - BearerAuth: []
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
 *     responses:
 *       200:
 *         description: Item added to cart successfully
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
 *                   example: "Item added to cart successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 1
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           name:
 *                             type: string
 *                             example: "Producto ejemplo"
 *                           price:
 *                             type: number
 *                             example: 100
 *                     total:
 *                       type: number
 *                       example: 200
 *       400:
 *         description: Bad request - missing required fields or invalid quantity
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.post('/add', authenticateToken, (req, res) => cartController.addToCart(req, res));

/**
 * @swagger
 * /api/cart/update:
 *   patch:
 *     tags: [Cart]
 *     summary: Update cart item quantity
 *     description: Set a product quantity in the cart. If quantity is 0, the item is removed.
 *     security:
 *       - BearerAuth: []
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
 *                 minimum: 0
 *                 example: 3
 *     responses:
 *       200:
 *         description: Cart item updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Cart or item not found
 *       500:
 *         description: Internal server error
 */
router.patch('/update', authenticateToken, (req, res) => cartController.updateCartItem(req, res));

/**
 * @swagger
 * /api/cart/remove:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove item from cart
 *     description: Remove a product from the authenticated user's cart.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Item removed from cart successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Cart or item not found
 *       500:
 *         description: Internal server error
 */
router.delete('/remove', authenticateToken, (req, res) => cartController.removeFromCart(req, res));

module.exports = router;
