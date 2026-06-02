const BaseController = require('./BaseController');
const prisma = require('../config/prisma');

/**
 * Cart Controller - Handles shopping cart operations
 * Uses Prisma to persist cart data in an order with status=cart
 */
class CartController extends BaseController {
  async runCartTransaction(work) {
    return prisma.$transaction(work, {
      maxWait: 10000,
      timeout: 30000
    });
  }

  async lockUserCartScope(tx, userId) {
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
  }

  async refreshCart(tx, cartOrderId) {
    return tx.order.findUnique({
      where: { id: cartOrderId },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });
  }

  async recalculateCartTotal(tx, cartOrderId) {
    const refreshedOrder = await this.refreshCart(tx, cartOrderId);
    const newTotal = refreshedOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    await tx.order.update({
      where: { id: cartOrderId },
      data: { total: newTotal }
    });

    return this.refreshCart(tx, cartOrderId);
  }

  async getOrCreateNormalizedCart(tx, userId) {
    const carts = await tx.order.findMany({
      where: {
        userId,
        status: 'cart'
      },
      include: {
        items: true
      },
      orderBy: {
        id: 'asc'
      }
    });

    if (carts.length === 0) {
      const created = await tx.order.create({
        data: {
          userId,
          total: 0,
          status: 'cart'
        }
      });
      return this.refreshCart(tx, created.id);
    }

    if (carts.length === 1) {
      return this.refreshCart(tx, carts[0].id);
    }

    const primaryCart = carts[0];
    const secondaryCartIds = carts.slice(1).map((cart) => cart.id);
    const mergedByProduct = new Map();

    for (const cart of carts) {
      for (const item of cart.items) {
        const current = mergedByProduct.get(item.productId) || { quantity: 0, price: item.price };
        current.quantity += item.quantity;
        current.price = item.price;
        mergedByProduct.set(item.productId, current);
      }
    }

    const productIds = Array.from(mergedByProduct.keys());
    const products = productIds.length > 0
      ? await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, price: true }
      })
      : [];
    const productPriceMap = products.reduce((acc, product) => {
      acc[product.id] = product.price;
      return acc;
    }, {});

    await tx.orderItem.deleteMany({
      where: {
        orderId: { in: carts.map((cart) => cart.id) }
      }
    });

    const mergedRows = Array.from(mergedByProduct.entries())
      .filter(([, payload]) => Number.isInteger(payload.quantity) && payload.quantity > 0)
      .map(([productId, payload]) => ({
        orderId: primaryCart.id,
        productId,
        quantity: payload.quantity,
        price: productPriceMap[productId] ?? payload.price
      }));

    if (mergedRows.length > 0) {
      await tx.orderItem.createMany({
        data: mergedRows
      });
    }

    if (secondaryCartIds.length > 0) {
      await tx.order.deleteMany({
        where: {
          id: { in: secondaryCartIds }
        }
      });
    }

    return this.recalculateCartTotal(tx, primaryCart.id);
  }

  buildCartPayload(cartOrder) {
    if (!cartOrder) {
      return { items: [], total: 0 };
    }

    const items = cartOrder.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      name: item.product?.name || null,
      price: item.price,
      availableStock: item.product?.stock ?? null
    }));

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { items, total };
  }

  async getCart(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return this.sendError(res, 'Autenticacion requerida', 401);
      }

      const cartOrder = await this.runCartTransaction(async (tx) => {
        await this.lockUserCartScope(tx, userId);
        return this.getOrCreateNormalizedCart(tx, userId);
      });

      return this.sendSuccess(res, this.buildCartPayload(cartOrder), 'Carrito obtenido correctamente');
    } catch (error) {
      return this.sendError(res, 'No se pudo obtener el carrito', 500, error);
    }
  }

  async addToCart(req, res) {
    try {
      const { productId, quantity } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return this.sendError(res, 'Autenticacion requerida', 401);
      }

      const validation = this.validateRequired(req.body, ['productId', 'quantity']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      const parsedProductId = Number(productId);
      const parsedQuantity = Number(quantity);

      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return this.sendError(res, 'productId debe ser un numero entero positivo', 400);
      }
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        return this.sendError(res, 'La cantidad debe ser un numero entero positivo', 400);
      }

      const updatedOrder = await this.runCartTransaction(async (tx) => {
        await this.lockUserCartScope(tx, userId);

        const product = await tx.product.findUnique({
          where: { id: parsedProductId }
        });

        if (!product || !product.isActive) {
          const productError = new Error('Producto no encontrado o no disponible');
          productError.httpStatus = 404;
          throw productError;
        }

        if (req.user?.role !== 'admin' && product.zoneId !== req.user.zoneId) {
          const zoneError = new Error('El producto esta fuera de tu zona');
          zoneError.httpStatus = 403;
          throw zoneError;
        }

        const cartOrder = await this.getOrCreateNormalizedCart(tx, userId);
        const existingItem = cartOrder.items.find((item) => item.productId === parsedProductId);
        const desiredQuantity = existingItem ? existingItem.quantity + parsedQuantity : parsedQuantity;

        if (desiredQuantity > product.stock) {
          const stockError = new Error(`Stock insuficiente para el producto ${product.name}. Disponible: ${product.stock}`);
          stockError.httpStatus = 400;
          throw stockError;
        }

        if (existingItem) {
          await tx.orderItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: desiredQuantity,
              price: product.price
            }
          });
        } else {
          await tx.orderItem.create({
            data: {
              orderId: cartOrder.id,
              productId: parsedProductId,
              quantity: parsedQuantity,
              price: product.price
            }
          });
        }

        return this.recalculateCartTotal(tx, cartOrder.id);
      });

      return this.sendSuccess(res, this.buildCartPayload(updatedOrder), 'Producto agregado al carrito correctamente');
    } catch (error) {
      if (error.httpStatus) {
        return this.sendError(res, error.message, error.httpStatus);
      }
      return this.sendError(res, 'No se pudo agregar el producto al carrito', 500, error);
    }
  }

  async updateCartItem(req, res) {
    try {
      const { productId, quantity } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return this.sendError(res, 'Autenticacion requerida', 401);
      }

      const validation = this.validateRequired(req.body, ['productId', 'quantity']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      const parsedProductId = Number(productId);
      const parsedQuantity = Number(quantity);

      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return this.sendError(res, 'productId debe ser un numero entero positivo', 400);
      }
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
        return this.sendError(res, 'quantity debe ser un numero entero mayor o igual a 0', 400);
      }

      const updatedOrder = await this.runCartTransaction(async (tx) => {
        await this.lockUserCartScope(tx, userId);

        const cartOrder = await this.getOrCreateNormalizedCart(tx, userId);
        const existingItem = cartOrder.items.find((item) => item.productId === parsedProductId);
        if (!existingItem) {
          const itemNotFound = new Error('El producto no esta en el carrito');
          itemNotFound.httpStatus = 404;
          throw itemNotFound;
        }

        const product = await tx.product.findUnique({
          where: { id: parsedProductId }
        });

        if (!product || !product.isActive) {
          const productError = new Error('Producto no encontrado o no disponible');
          productError.httpStatus = 404;
          throw productError;
        }

        if (req.user?.role !== 'admin' && product.zoneId !== req.user.zoneId) {
          const zoneError = new Error('El producto esta fuera de tu zona');
          zoneError.httpStatus = 403;
          throw zoneError;
        }

        if (parsedQuantity > product.stock) {
          const stockError = new Error(`Stock insuficiente para el producto ${product.name}. Disponible: ${product.stock}`);
          stockError.httpStatus = 400;
          throw stockError;
        }

        if (parsedQuantity === 0) {
          await tx.orderItem.delete({
            where: { id: existingItem.id }
          });
        } else {
          await tx.orderItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: parsedQuantity,
              price: product.price
            }
          });
        }

        return this.recalculateCartTotal(tx, cartOrder.id);
      });

      return this.sendSuccess(res, this.buildCartPayload(updatedOrder), 'Producto del carrito actualizado correctamente');
    } catch (error) {
      if (error.httpStatus) {
        return this.sendError(res, error.message, error.httpStatus);
      }
      return this.sendError(res, 'No se pudo actualizar el producto del carrito', 500, error);
    }
  }

  async removeFromCart(req, res) {
    try {
      const { productId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return this.sendError(res, 'Autenticacion requerida', 401);
      }

      const validation = this.validateRequired(req.body, ['productId']);
      if (!validation.isValid) {
        return this.sendError(res, validation.message, 400);
      }

      const parsedProductId = Number(productId);
      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return this.sendError(res, 'productId debe ser un numero entero positivo', 400);
      }

      const updatedOrder = await this.runCartTransaction(async (tx) => {
        await this.lockUserCartScope(tx, userId);

        const cartOrder = await this.getOrCreateNormalizedCart(tx, userId);
        const existingItem = cartOrder.items.find((item) => item.productId === parsedProductId);
        if (!existingItem) {
          const itemNotFound = new Error('El producto no esta en el carrito');
          itemNotFound.httpStatus = 404;
          throw itemNotFound;
        }

        await tx.orderItem.delete({
          where: { id: existingItem.id }
        });

        return this.recalculateCartTotal(tx, cartOrder.id);
      });

      return this.sendSuccess(res, this.buildCartPayload(updatedOrder), 'Producto eliminado del carrito correctamente');
    } catch (error) {
      if (error.httpStatus) {
        return this.sendError(res, error.message, error.httpStatus);
      }
      return this.sendError(res, 'No se pudo eliminar el producto del carrito', 500, error);
    }
  }
}

module.exports = CartController;
