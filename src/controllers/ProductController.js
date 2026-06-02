const BaseController = require('./BaseController');
const prisma = require('../config/prisma');

const MAX_IMAGES_PER_PRODUCT = 5;
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

class ProductController extends BaseController {
  mapProduct(product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      stock: product.stock,
      zoneId: product.zoneId,
      sellerId: product.sellerId,
      isActive: product.isActive,
      images: (product.images || [])
        .sort((a, b) => a.position - b.position)
        .map((image) => ({
          id: image.id,
          url: image.url,
          position: image.position
        }))
    };
  }

  parseImageUrls(imagesInput) {
    if (imagesInput === undefined) return { provided: false, urls: [] };
    if (!Array.isArray(imagesInput)) return { error: 'images debe ser un arreglo' };
    if (imagesInput.length > MAX_IMAGES_PER_PRODUCT) {
      return { error: `Solo se permiten ${MAX_IMAGES_PER_PRODUCT} imagenes por producto` };
    }

    const urls = [];
    for (const item of imagesInput) {
      const url = typeof item === 'string' ? item : item?.url;
      if (typeof url !== 'string' || url.trim() === '') {
        return { error: 'Cada imagen debe tener una URL valida' };
      }

      const normalizedUrl = url.trim();
      let parsedUrl;
      try {
        parsedUrl = new URL(normalizedUrl);
      } catch {
        return { error: `URL de imagen invalida: ${normalizedUrl}` };
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return { error: `La URL de imagen debe usar http o https: ${normalizedUrl}` };
      }

      const pathname = parsedUrl.pathname.toLowerCase();
      const hasValidExtension = ALLOWED_IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
      if (!hasValidExtension) {
        return { error: `Formato de imagen no permitido en URL: ${normalizedUrl}` };
      }

      if (normalizedUrl.length > 2048) {
        return { error: 'La URL de imagen es demasiado larga' };
      }

      urls.push(normalizedUrl);
    }

    return { provided: true, urls };
  }

  async upsertProductImages(tx, productId, imageUrls) {
    await tx.productImage.deleteMany({
      where: { productId }
    });

    if (imageUrls.length === 0) return;

    await tx.productImage.createMany({
      data: imageUrls.map((url, index) => ({
        productId,
        url,
        position: index + 1
      }))
    });
  }

  async getProducts(req, res) {
    try {
      const {
        search,
        minPrice,
        maxPrice,
        inStock,
        page,
        limit,
        sort
      } = req.query;

      const hasAdvancedQuery = Object.keys(req.query || {}).length > 0;
      const parsedPage = page === undefined ? 1 : Number(page);
      const parsedLimit = limit === undefined ? 20 : Number(limit);

      if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
        return this.sendError(res, 'page debe ser un numero entero positivo', 400);
      }
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
        return this.sendError(res, 'limit debe ser un numero entero positivo entre 1 y 100', 400);
      }

      const parsedMinPrice = minPrice === undefined ? undefined : Number(minPrice);
      const parsedMaxPrice = maxPrice === undefined ? undefined : Number(maxPrice);
      if (parsedMinPrice !== undefined && (!Number.isFinite(parsedMinPrice) || parsedMinPrice < 0)) {
        return this.sendError(res, 'minPrice debe ser un numero mayor o igual a 0', 400);
      }
      if (parsedMaxPrice !== undefined && (!Number.isFinite(parsedMaxPrice) || parsedMaxPrice < 0)) {
        return this.sendError(res, 'maxPrice debe ser un numero mayor o igual a 0', 400);
      }
      if (
        parsedMinPrice !== undefined &&
        parsedMaxPrice !== undefined &&
        parsedMinPrice > parsedMaxPrice
      ) {
        return this.sendError(res, 'minPrice no puede ser mayor que maxPrice', 400);
      }

      const normalizedSearch = typeof search === 'string' ? search.trim().toLowerCase() : '';
      const searchTerms = normalizedSearch.length > 0
        ? normalizedSearch.split(/\s+/).filter(Boolean)
        : [];

      const where = {
        isActive: true
      };

      if (req.user && req.user.role !== 'admin') {
        where.zoneId = req.user.zoneId;
      }

      if (parsedMinPrice !== undefined || parsedMaxPrice !== undefined) {
        where.price = {
          ...(parsedMinPrice !== undefined && { gte: parsedMinPrice }),
          ...(parsedMaxPrice !== undefined && { lte: parsedMaxPrice }),
        };
      }

      if (inStock !== undefined) {
        const normalizedInStock = String(inStock).toLowerCase();
        if (normalizedInStock !== 'true' && normalizedInStock !== 'false') {
          return this.sendError(res, 'inStock debe ser true o false', 400);
        }
        where.stock = normalizedInStock === 'true' ? { gt: 0 } : { equals: 0 };
      }

      if (searchTerms.length > 0) {
        where.AND = searchTerms.map((term) => ({
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } }
          ]
        }));
      }

      const requestedSort = typeof sort === 'string' ? sort : '';
      const sortMap = {
        price_asc: { price: 'asc' },
        price_desc: { price: 'desc' },
        name_asc: { name: 'asc' },
        name_desc: { name: 'desc' },
        newest: { createdAt: 'desc' },
        oldest: { createdAt: 'asc' },
      };
      const isRelevanceSort = requestedSort === 'relevance' || (!requestedSort && searchTerms.length > 0);

      const products = await prisma.product.findMany({
        where,
        include: {
          images: {
            orderBy: { position: 'asc' }
          }
        },
        ...(isRelevanceSort ? {} : { orderBy: sortMap[requestedSort] || { createdAt: 'desc' } })
      });

      let orderedProducts = products;
      if (isRelevanceSort && searchTerms.length > 0) {
        const scoreProduct = (product) => {
          const name = (product.name || '').toLowerCase();
          const description = (product.description || '').toLowerCase();

          return searchTerms.reduce((score, term) => {
            if (name === term) return score + 100;
            if (name.startsWith(term)) return score + 50;
            if (name.includes(term)) return score + 25;
            if (description.includes(term)) return score + 10;
            return score;
          }, 0);
        };

        orderedProducts = [...products].sort((a, b) => {
          const scoreDiff = scoreProduct(b) - scoreProduct(a);
          if (scoreDiff !== 0) return scoreDiff;
          return a.name.localeCompare(b.name);
        });
      }

      const total = orderedProducts.length;
      const offset = (parsedPage - 1) * parsedLimit;
      const paginatedProducts = orderedProducts.slice(offset, offset + parsedLimit);
      const result = paginatedProducts.map((product) => this.mapProduct(product));

      if (!hasAdvancedQuery) {
        return this.sendSuccess(res, result, 'Productos obtenidos correctamente');
      }

      return res.status(200).json({
        success: true,
        message: 'Productos obtenidos correctamente',
        data: result,
        pagination: {
          total,
          page: parsedPage,
          pageSize: parsedLimit,
          totalPages: Math.ceil(total / parsedLimit)
        },
        filtersApplied: {
          search: normalizedSearch || null,
          minPrice: parsedMinPrice ?? null,
          maxPrice: parsedMaxPrice ?? null,
          inStock: inStock !== undefined ? String(inStock).toLowerCase() === 'true' : null,
          sort: requestedSort || (searchTerms.length > 0 ? 'relevance' : 'newest')
        }
      });
    } catch (error) {
      this.sendError(res, 'No se pudieron obtener los productos', 500, error);
    }
  }

  async getProductById(req, res) {
    try {
      const productId = parseInt(req.params.id, 10);
      if (Number.isNaN(productId)) {
        return this.sendError(res, 'ID de producto invalido', 400);
      }

      const filter = req.user?.role === 'admin'
        ? { id: productId }
        : {
            id: productId,
            isActive: true,
            ...(req.user ? { zoneId: req.user.zoneId } : {})
          };

      const product = await prisma.product.findFirst({
        where: filter,
        include: {
          images: {
            orderBy: { position: 'asc' }
          }
        }
      });

      if (!product) {
        return this.sendError(res, 'Producto no encontrado o no disponible', 404);
      }

      this.sendSuccess(res, this.mapProduct(product), 'Producto obtenido correctamente');
    } catch (error) {
      this.sendError(res, 'No se pudo obtener el producto', 500, error);
    }
  }

  async createProduct(req, res) {
    try {
      const { name, description, price, stock, zoneId, sellerId, images } = req.body;

      const validation = this.validateRequired(req.body, ['name', 'price', 'stock', 'zoneId']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      if (!this.isNonEmptyString(name)) {
        return this.sendError(res, 'El nombre del producto es obligatorio', 400);
      }

      const parsedPrice = Number(price);
      const parsedStock = Number(stock);
      const parsedZoneId = Number(zoneId);
      const parsedImages = this.parseImageUrls(images);
      if (parsedImages.error) {
        return this.sendError(res, parsedImages.error, 400);
      }

      if (!this.isPositiveNumber(parsedPrice)) {
        return this.sendError(res, 'El precio del producto debe ser un numero mayor o igual a 0', 400);
      }
      if (!this.isPositiveInteger(parsedStock)) {
        return this.sendError(res, 'El stock del producto debe ser un numero entero mayor o igual a 0', 400);
      }
      if (!Number.isInteger(parsedZoneId) || parsedZoneId <= 0) {
        return this.sendError(res, 'zoneId debe ser un numero entero positivo', 400);
      }
      if (sellerId !== undefined && sellerId !== null && !Number.isInteger(Number(sellerId))) {
        return this.sendError(res, 'sellerId debe ser un numero entero', 400);
      }

      const zone = await prisma.zone.findUnique({
        where: { id: parsedZoneId }
      });
      if (!zone) {
        return this.sendError(res, 'Zona no encontrada', 400);
      }

      if (req.user?.role !== 'admin' && req.user?.zoneId !== parsedZoneId) {
        return this.sendError(res, 'Solo podes crear productos en tu propia zona', 403);
      }

      const product = await prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({
          data: {
            name,
            description,
            price: parsedPrice,
            stock: parsedStock,
            zoneId: parsedZoneId,
            sellerId: sellerId ? Number(sellerId) : null,
            isActive: true
          }
        });

        if (parsedImages.provided && parsedImages.urls.length > 0) {
          await this.upsertProductImages(tx, createdProduct.id, parsedImages.urls);
        }

        return tx.product.findUnique({
          where: { id: createdProduct.id },
          include: {
            images: {
              orderBy: { position: 'asc' }
            }
          }
        });
      });

      this.sendSuccess(res, this.mapProduct(product), 'Producto creado correctamente', 201);
    } catch (error) {
      this.sendError(res, 'No se pudo crear el producto', 500, error);
    }
  }

  async updateProduct(req, res) {
    try {
      const productId = parseInt(req.params.id, 10);
      if (Number.isNaN(productId)) {
        return this.sendError(res, 'ID de producto invalido', 400);
      }

      const { name, description, price, stock, zoneId, sellerId, isActive, images } = req.body;
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        return this.sendError(res, 'Producto no encontrado', 404);
      }

      if (req.user?.role !== 'admin' && req.user?.zoneId !== product.zoneId) {
        return this.sendError(res, 'Solo podes actualizar productos en tu propia zona', 403);
      }

      const updateData = {};
      if (name !== undefined) {
        if (!this.isNonEmptyString(name)) {
          return this.sendError(res, 'El nombre del producto no puede estar vacio', 400);
        }
        updateData.name = name;
      }
      if (description !== undefined) updateData.description = description;
      if (price !== undefined) {
        const parsedPrice = Number(price);
        if (!this.isPositiveNumber(parsedPrice)) {
          return this.sendError(res, 'El precio del producto debe ser un numero mayor o igual a 0', 400);
        }
        updateData.price = parsedPrice;
      }
      if (stock !== undefined) {
        const parsedStock = Number(stock);
        if (!this.isPositiveInteger(parsedStock)) {
          return this.sendError(res, 'El stock del producto debe ser un numero entero mayor o igual a 0', 400);
        }
        updateData.stock = parsedStock;
      }
      if (zoneId !== undefined) {
        const parsedZoneId = Number(zoneId);
        if (!Number.isInteger(parsedZoneId) || parsedZoneId <= 0) {
          return this.sendError(res, 'zoneId debe ser un numero entero positivo', 400);
        }
        const zone = await prisma.zone.findUnique({ where: { id: parsedZoneId } });
        if (!zone) {
          return this.sendError(res, 'Zona no encontrada', 400);
        }
        if (req.user?.role !== 'admin' && req.user?.zoneId !== parsedZoneId) {
          return this.sendError(res, 'Solo podes asignar productos a tu propia zona', 403);
        }
        updateData.zoneId = parsedZoneId;
      }
      if (sellerId !== undefined) {
        if (sellerId !== null && !Number.isInteger(Number(sellerId))) {
          return this.sendError(res, 'sellerId debe ser un numero entero', 400);
        }
        updateData.sellerId = sellerId ? Number(sellerId) : null;
      }
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);

      const parsedImages = this.parseImageUrls(images);
      if (parsedImages.error) {
        return this.sendError(res, parsedImages.error, 400);
      }

      const updatedProduct = await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId },
          data: updateData
        });

        if (parsedImages.provided) {
          await this.upsertProductImages(tx, productId, parsedImages.urls);
        }

        return tx.product.findUnique({
          where: { id: productId },
          include: {
            images: {
              orderBy: { position: 'asc' }
            }
          }
        });
      });

      this.sendSuccess(res, this.mapProduct(updatedProduct), 'Producto actualizado correctamente');
    } catch (error) {
      this.sendError(res, 'No se pudo actualizar el producto', 500, error);
    }
  }

  async updateProductImages(req, res) {
    try {
      const productId = parseInt(req.params.id, 10);
      if (Number.isNaN(productId)) {
        return this.sendError(res, 'ID de producto invalido', 400);
      }

      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        return this.sendError(res, 'Producto no encontrado', 404);
      }

      if (req.user?.role !== 'admin' && req.user?.zoneId !== product.zoneId) {
        return this.sendError(res, 'Solo podes administrar imagenes en tu propia zona', 403);
      }

      const parsedImages = this.parseImageUrls(req.body.images);
      if (parsedImages.error) {
        return this.sendError(res, parsedImages.error, 400);
      }
      if (!parsedImages.provided) {
        return this.sendError(res, 'images es obligatorio', 400);
      }

      const updatedProduct = await prisma.$transaction(async (tx) => {
        await this.upsertProductImages(tx, productId, parsedImages.urls);
        return tx.product.findUnique({
          where: { id: productId },
          include: {
            images: {
              orderBy: { position: 'asc' }
            }
          }
        });
      });

      return this.sendSuccess(res, this.mapProduct(updatedProduct), 'Imagenes del producto actualizadas correctamente');
    } catch (error) {
      return this.sendError(res, 'No se pudieron actualizar las imagenes del producto', 500, error);
    }
  }

  async deleteProduct(req, res) {
    try {
      const productId = parseInt(req.params.id, 10);
      if (Number.isNaN(productId)) {
        return this.sendError(res, 'ID de producto invalido', 400);
      }

      const product = await prisma.product.findUnique({
        where: { id: productId }
      });

      if (!product) {
        return this.sendError(res, 'Producto no encontrado', 404);
      }

      if (req.user?.role !== 'admin' && req.user?.zoneId !== product.zoneId) {
        return this.sendError(res, 'Solo podes eliminar productos en tu propia zona', 403);
      }

      await prisma.product.delete({
        where: { id: productId }
      });

      this.sendSuccess(res, null, 'Producto eliminado correctamente');
    } catch (error) {
      this.sendError(res, 'No se pudo eliminar el producto', 500, error);
    }
  }
}

module.exports = ProductController;
