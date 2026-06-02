const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const { authenticateToken, optionalAuthenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

const productController = new ProductController();

/**
 * @swagger
 * /api/products:
 *   get:
 *     tags: [Products]
 *     summary: Get all products
 *     description: Retrieve a list of active products, with optional search, filtering, sorting, and pagination. Public endpoint.
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Search text applied to name and description.
 *       - in: query
 *         name: minPrice
 *         required: false
 *         schema:
 *           type: number
 *         description: Minimum product price (inclusive).
 *       - in: query
 *         name: maxPrice
 *         required: false
 *         schema:
 *           type: number
 *         description: Maximum product price (inclusive).
 *       - in: query
 *         name: inStock
 *         required: false
 *         schema:
 *           type: boolean
 *         description: If true, only products with stock > 0. If false, only stock = 0.
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: sort
 *         required: false
 *         schema:
 *           type: string
 *           enum: [relevance, newest, oldest, price_asc, price_desc, name_asc, name_desc]
 *         description: Sort mode. If omitted and search is present, relevance is applied.
 *     responses:
 *       200:
 *         description: Products retrieved successfully
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
 *                   example: "Products retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: "Yerba Mate 1kg"
 *                       price:
 *                         type: number
 *                         example: 3500
 *                       stock:
 *                         type: integer
 *                         example: 20
 *                       zoneId:
 *                         type: integer
 *                         example: 1
 *                 pagination:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 28
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     pageSize:
 *                       type: integer
 *                       example: 20
 *                     totalPages:
 *                       type: integer
 *                       example: 2
 *                 filtersApplied:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     search:
 *                       type: string
 *                       nullable: true
 *                       example: "yerba mate"
 *                     minPrice:
 *                       type: number
 *                       nullable: true
 *                       example: 1000
 *                     maxPrice:
 *                       type: number
 *                       nullable: true
 *                       example: 6000
 *                     inStock:
 *                       type: boolean
 *                       nullable: true
 *                       example: true
 *                     sort:
 *                       type: string
 *                       example: "relevance"
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Internal server error
 */
router.get('/', optionalAuthenticateToken, (req, res) => productController.getProducts(req, res));

/**
 * @swagger
 * /api/products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product
 *     description: Create a new product in the catalog
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - stock
 *               - zoneId
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Yerba Mate 1kg"
 *               description:
 *                 type: string
 *                 example: "Producto de prueba"
 *               price:
 *                 type: number
 *                 example: 3500
 *               stock:
 *                 type: integer
 *                 example: 20
 *               zoneId:
 *                 type: integer
 *                 example: 1
 *               sellerId:
 *                 type: integer
 *                 example: 1
 *               images:
 *                 type: array
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example:
 *                   - "https://cdn.ejemplo.com/productos/yerba-1.jpg"
 *                   - "https://cdn.ejemplo.com/productos/yerba-2.jpg"
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticateToken, authorizeRoles('admin', 'seller'), (req, res) => productController.createProduct(req, res));

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update a product
 *     description: Update an existing product by ID
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Yerba Mate 1kg"
 *               description:
 *                 type: string
 *                 example: "Descripcion actualizada"
 *               price:
 *                 type: number
 *                 example: 3600
 *               stock:
 *                 type: integer
 *                 example: 15
 *               zoneId:
 *                 type: integer
 *                 example: 1
 *               sellerId:
 *                 type: integer
 *                 example: 1
 *               images:
 *                 type: array
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *                   format: uri
 *     responses:
 *       200:
 *         description: Product updated successfully
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
 *                   example: "Product updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Yerba Mate 1kg"
 *                     price:
 *                       type: number
 *                       example: 3600
 *       400:
 *         description: Bad request
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authenticateToken, authorizeRoles('admin', 'seller'), (req, res) => productController.updateProduct(req, res));

/**
 * @swagger
 * /api/products/{id}/images:
 *   patch:
 *     tags: [Products]
 *     summary: Replace/reorder product images
 *     description: Replaces all product images preserving the sent order. Send an empty array to remove all images.
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
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example:
 *                   - "https://cdn.ejemplo.com/productos/yerba-1.jpg"
 *                   - "https://cdn.ejemplo.com/productos/yerba-2.jpg"
 *     responses:
 *       200:
 *         description: Product images updated successfully
 *       400:
 *         description: Invalid payload
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/images', authenticateToken, authorizeRoles('admin', 'seller'), (req, res) =>
  productController.updateProductImages(req, res)
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product
 *     description: Delete a product by its ID
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
 *         description: Product deleted successfully
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
 *                   example: "Product deleted successfully"
 *       400:
 *         description: Invalid product ID
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'seller'), (req, res) => productController.deleteProduct(req, res));

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 *     description: Retrieve a specific product by its ID. Public endpoint.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product retrieved successfully
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
 *                   example: "Product retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Yerba Mate 1kg"
 *                     price:
 *                       type: number
 *                       example: 3500
 *                     stock:
 *                       type: integer
 *                       example: 20
 *                     zoneId:
 *                       type: integer
 *                       example: 1
 *       400:
 *         description: Invalid product ID
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', optionalAuthenticateToken, (req, res) => productController.getProductById(req, res));

module.exports = router;
