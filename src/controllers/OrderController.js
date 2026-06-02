const BaseController = require('./BaseController');
const prisma = require('../config/prisma');
const mercadoPagoService = require('../services/mercadoPagoService');
const config = require('../config/config');

class OrderController extends BaseController {
  getAllowedOrderStatuses() {
    return ['pending', 'delivered', 'cancelled'];
  }

  getPendingOrderTtlMinutes() {
    return Math.max(5, Number(config.orders?.pendingTtlMinutes) || 60);
  }

  async expireStalePendingOrdersForUser(userId) {
    const ttlMinutes = this.getPendingOrderTtlMinutes();
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

    await prisma.order.updateMany({
      where: {
        userId,
        status: 'pending',
        paymentStatus: { in: ['pending_payment', 'preference_created'] },
        updatedAt: { lt: cutoff }
      },
      data: {
        status: 'cancelled',
        updatedAt: new Date()
      }
    });
  }

  buildOrderResponse(order, preference) {
    const isPurchaseCompleted = order.paymentStatus === 'approved' && order.status !== 'cancelled';

    return {
      id: order.id,
      status: order.status,
      allowedStatuses: this.getAllowedOrderStatuses(),
      paymentStatus: order.paymentStatus,
      isPurchaseCompleted,
      payment: {
        provider: 'mercadopago',
        configured: preference.configured,
        preferenceId: order.mpPreferenceId || null,
        initPoint: preference.initPoint || null,
        sandboxInitPoint: preference.sandboxInitPoint || null,
        message: preference.message || null
      },
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.product?.name || null,
        quantity: item.quantity,
        price: item.price
      }))
    };
  }

  async getExistingOrderResponse(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: { name: true }
            }
          }
        }
      }
    });

    if (!order) {
      const notFound = new Error('Orden no encontrada');
      notFound.httpStatus = 404;
      throw notFound;
    }

    const preference = {
      configured: mercadoPagoService.isConfigured(),
      paymentStatus: order.paymentStatus,
      preferenceId: order.mpPreferenceId || null,
      initPoint: order.mpInitPoint || null,
      sandboxInitPoint: null,
      message: order.mpPreferenceId || order.mpInitPoint
        ? null
        : 'Las credenciales de Mercado Pago aun no estan configuradas'
    };

    return { order, preference };
  }

  async enrichOrderWithPayment(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    let preference = {
      configured: false,
      paymentStatus: 'pending_setup',
      message: 'Las credenciales de Mercado Pago aun no estan configuradas'
    };

    try {
      preference = await mercadoPagoService.createPreference(order, order.items);
    } catch (preferenceError) {
      console.error('Mercado Pago preference creation failed:', preferenceError.message);
    }

    const paymentUpdateData = {
      paymentStatus: preference.paymentStatus,
      paymentUpdatedAt: new Date()
    };
    if (preference.preferenceId) paymentUpdateData.mpPreferenceId = preference.preferenceId;
    if (preference.externalReference) paymentUpdateData.mpExternalReference = preference.externalReference;
    if (preference.initPoint || preference.sandboxInitPoint) {
      paymentUpdateData.mpInitPoint = preference.initPoint || preference.sandboxInitPoint;
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: paymentUpdateData,
      include: {
        items: {
          include: {
            product: {
              select: { name: true }
            }
          }
        }
      }
    });

    return { order: updatedOrder, preference };
  }

  async createOrder(req, res) {
    try {
      const targetUserId = req.user?.id;
      if (!targetUserId) {
        return this.sendError(res, 'Usuario autenticado requerido', 401);
      }

      await this.expireStalePendingOrdersForUser(targetUserId);

      const createdOrder = await prisma.$transaction(async (tx) => {
        const cartOrder = await tx.order.findFirst({
          where: { userId: targetUserId, status: 'cart' },
          include: { items: true }
        });

        if (!cartOrder || cartOrder.items.length === 0) {
          const emptyCartError = new Error('El carrito esta vacio');
          emptyCartError.httpStatus = 400;
          throw emptyCartError;
        }

        await tx.order.updateMany({
          where: {
            userId: targetUserId,
            status: 'pending',
            paymentStatus: { in: ['pending_payment', 'preference_created'] }
          },
          data: {
            status: 'cancelled',
            updatedAt: new Date()
          }
        });

        const consolidatedCartMap = new Map();
        for (const item of cartOrder.items) {
          const existing = consolidatedCartMap.get(item.productId) || {
            productId: item.productId,
            quantity: 0
          };
          existing.quantity += item.quantity;
          consolidatedCartMap.set(item.productId, existing);
        }
        const consolidatedItems = Array.from(consolidatedCartMap.values());

        const productIds = [...new Set(consolidatedItems.map((item) => Number(item.productId)))];
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, isActive: true }
        });

        if (products.length !== productIds.length) {
          const inactiveProductsError = new Error('Uno o mas productos ya no estan disponibles');
          inactiveProductsError.httpStatus = 400;
          throw inactiveProductsError;
        }

        if (req.user?.role !== 'admin') {
          const wrongZone = products.find((product) => product.zoneId !== req.user?.zoneId);
          if (wrongZone) {
            const zoneError = new Error('Uno o mas productos estan fuera de tu zona');
            zoneError.httpStatus = 400;
            throw zoneError;
          }
        }

        const productMap = products.reduce((map, product) => {
          map[product.id] = product;
          return map;
        }, {});

        const insufficientItems = consolidatedItems
          .map((item) => {
            const product = productMap[item.productId];
            if (!product || product.stock < item.quantity) {
              return {
                productId: item.productId,
                name: product?.name || null,
                requested: item.quantity,
                available: product?.stock ?? 0
              };
            }
            return null;
          })
          .filter(Boolean);

        if (insufficientItems.length > 0) {
          const stockError = new Error('Stock insuficiente para uno o mas productos');
          stockError.httpStatus = 400;
          stockError.details = { items: insufficientItems };
          throw stockError;
        }

        const total = consolidatedItems.reduce((sum, item) => sum + productMap[item.productId].price * item.quantity, 0);
        const order = await tx.order.create({
          data: {
            userId: targetUserId,
            total,
            status: 'pending',
            paymentProvider: 'mercadopago',
            paymentStatus: mercadoPagoService.isConfigured() ? 'pending_payment' : 'pending_setup',
            mpExternalReference: '',
            paymentUpdatedAt: new Date()
          }
        });

        for (const item of consolidatedItems) {
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: item.productId,
              quantity: item.quantity,
              price: productMap[item.productId].price
            }
          });
        }

        await tx.order.update({
          where: { id: order.id },
          data: { mpExternalReference: String(order.id) }
        });

        return order.id;
      });

      const enriched = await this.enrichOrderWithPayment(createdOrder);
      return this.sendSuccess(res, this.buildOrderResponse(enriched.order, enriched.preference), 'Orden creada correctamente', 201);
    } catch (error) {
      if (error.httpStatus) {
        return this.sendError(res, error.message, error.httpStatus, error.details || null);
      }
      return this.sendError(res, 'No se pudo crear la orden', 500, error);
    }
  }

  async createDirectOrder(req, res) {
    let idempotencyKey = null;
    try {
      const userId = req.user?.id;
      if (!userId) {
        return this.sendError(res, 'Usuario autenticado requerido', 401);
      }

      const headerIdempotencyKey = req.headers['idempotency-key'];
      const bodyIdempotencyKey = req.body.idempotencyKey;
      const rawIdempotencyKey = headerIdempotencyKey || bodyIdempotencyKey;
      idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim() : null;
      const parsedProductId = Number(req.body.productId);
      const parsedQuantity = Number(req.body.quantity);

      if (!idempotencyKey) {
        return this.sendError(res, 'Idempotency-Key es obligatorio para orden directa', 400);
      }

      const ttlHours = Math.max(1, Number(config.orders?.idempotencyTtlHours) || 24);
      const cutoff = new Date(Date.now() - (ttlHours * 60 * 60 * 1000));
      await prisma.idempotencyRequest.deleteMany({
        where: {
          action: 'direct_order',
          createdAt: { lt: cutoff }
        }
      });

      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return this.sendError(res, 'productId debe ser un numero entero positivo', 400);
      }
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        return this.sendError(res, 'quantity debe ser un numero entero positivo', 400);
      }
      if (idempotencyKey.length > 128) {
        return this.sendError(res, 'idempotencyKey no puede superar 128 caracteres', 400);
      }

      const existingIdempotency = await prisma.idempotencyRequest.findUnique({
        where: {
          userId_action_key: {
            userId,
            action: 'direct_order',
            key: idempotencyKey
          }
        }
      });

      if (existingIdempotency?.orderId) {
        const existing = await this.getExistingOrderResponse(existingIdempotency.orderId);
        return this.sendSuccess(
          res,
          this.buildOrderResponse(existing.order, existing.preference),
          'Orden directa recuperada por idempotencia',
          200
        );
      }
      if (existingIdempotency && !existingIdempotency.orderId) {
        return this.sendError(res, 'La orden directa se esta procesando, reintenta en unos segundos', 409);
      }

      const createdOrderId = await prisma.$transaction(async (tx) => {
        const createdIdempotency = await tx.idempotencyRequest.create({
          data: {
            userId,
            action: 'direct_order',
            key: idempotencyKey
          }
        });
        const idempotencyRequestId = createdIdempotency.id;

        const product = await tx.product.findUnique({
          where: { id: parsedProductId }
        });

        if (!product || !product.isActive) {
          const notFound = new Error('Producto no encontrado o no disponible');
          notFound.httpStatus = 404;
          throw notFound;
        }

        if (req.user?.role !== 'admin' && product.zoneId !== req.user?.zoneId) {
          const zoneError = new Error('El producto esta fuera de tu zona');
          zoneError.httpStatus = 403;
          throw zoneError;
        }

        if (product.stock < parsedQuantity) {
          const stockError = new Error(`Stock insuficiente para el producto ${product.name}. Disponible: ${product.stock}`);
          stockError.httpStatus = 400;
          stockError.details = {
            items: [
              {
                productId: product.id,
                name: product.name,
                requested: parsedQuantity,
                available: product.stock
              }
            ]
          };
          throw stockError;
        }

        const total = product.price * parsedQuantity;
        const order = await tx.order.create({
          data: {
            userId,
            total,
            status: 'pending',
            paymentProvider: 'mercadopago',
            paymentStatus: mercadoPagoService.isConfigured() ? 'pending_payment' : 'pending_setup',
            mpExternalReference: '',
            paymentUpdatedAt: new Date()
          }
        });

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: parsedProductId,
            quantity: parsedQuantity,
            price: product.price
          }
        });

        await tx.order.update({
          where: { id: order.id },
          data: { mpExternalReference: String(order.id) }
        });

        await tx.idempotencyRequest.update({
          where: { id: idempotencyRequestId },
          data: { orderId: order.id }
        });

        return order.id;
      });

      const enriched = await this.enrichOrderWithPayment(createdOrderId);
      return this.sendSuccess(
        res,
        this.buildOrderResponse(enriched.order, enriched.preference),
        'Orden directa creada correctamente',
        201
      );
    } catch (error) {
      if (error.code === 'P2002' && idempotencyKey) {
        const userId = req.user?.id;
        const existingIdempotency = await prisma.idempotencyRequest.findUnique({
          where: {
            userId_action_key: {
              userId,
              action: 'direct_order',
              key: idempotencyKey
            }
          }
        });
        if (existingIdempotency?.orderId) {
          const enrichedExisting = await this.getExistingOrderResponse(existingIdempotency.orderId);
          return this.sendSuccess(
            res,
            this.buildOrderResponse(enrichedExisting.order, enrichedExisting.preference),
            'Orden directa recuperada por idempotencia',
            200
          );
        }
        return this.sendError(res, 'La orden directa se esta procesando, reintenta en unos segundos', 409);
      }
      if (error.httpStatus) {
        return this.sendError(res, error.message, error.httpStatus, error.details || null);
      }
      return this.sendError(res, 'No se pudo crear la orden directa', 500, error);
    }
  }

  async getOrders(req, res) {
    try {
      const role = req.user?.role;
      const scopeFilter = (role === 'admin' || role === 'seller')
        ? { user: { zoneId: req.user?.zoneId } }
        : { userId: req.user?.id };

      const orders = await prisma.order.findMany({
        where: { ...scopeFilter, status: { not: 'cart' } },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: {
                select: { name: true }
              }
            }
          }
        }
      });

      const result = orders.map((order) => ({
        id: order.id,
        status: order.status,
        allowedStatuses: this.getAllowedOrderStatuses(),
        paymentStatus: order.paymentStatus,
        isPurchaseCompleted: order.paymentStatus === 'approved' && order.status !== 'cancelled',
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.items.map((item) => ({
          productId: item.productId,
          productName: item.product?.name || null,
          quantity: item.quantity,
          price: item.price
        }))
      }));

      this.sendSuccess(res, result, 'Ordenes obtenidas correctamente');
    } catch (error) {
      this.sendError(res, 'No se pudieron obtener las ordenes', 500, error);
    }
  }

  async getCurrentPendingPaymentOrder(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return this.sendError(res, 'Usuario autenticado requerido', 401);
      }

      await this.expireStalePendingOrdersForUser(userId);

      const pendingOrder = await prisma.order.findFirst({
        where: {
          userId,
          status: 'pending',
          paymentStatus: { in: ['pending_payment', 'preference_created'] }
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (!pendingOrder) {
        return this.sendSuccess(res, null, 'No hay una orden pendiente de pago activa');
      }

      const existing = await this.getExistingOrderResponse(pendingOrder.id);
      return this.sendSuccess(
        res,
        this.buildOrderResponse(existing.order, existing.preference),
        'Orden pendiente de pago obtenida correctamente'
      );
    } catch (error) {
      return this.sendError(res, 'No se pudo obtener la orden pendiente de pago', 500, error);
    }
  }

  async cancelCurrentPendingPaymentOrder(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return this.sendError(res, 'Usuario autenticado requerido', 401);
      }

      await this.expireStalePendingOrdersForUser(userId);

      const pendingOrder = await prisma.order.findFirst({
        where: {
          userId,
          status: 'pending',
          paymentStatus: { in: ['pending_payment', 'preference_created'] }
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          items: {
            include: {
              product: { select: { name: true } }
            }
          }
        }
      });

      if (!pendingOrder) {
        return this.sendError(res, 'No hay una orden pendiente de pago activa para cancelar', 404);
      }

      if (pendingOrder.paymentStatus === 'approved') {
        return this.sendError(res, 'No se puede cancelar una orden con pago aprobado desde este endpoint', 409);
      }

      const cancelledOrder = await prisma.order.update({
        where: { id: pendingOrder.id },
        data: {
          status: 'cancelled',
          updatedAt: new Date()
        },
        include: {
          items: {
            include: {
              product: { select: { name: true } }
            }
          }
        }
      });

      return this.sendSuccess(
        res,
        {
          id: cancelledOrder.id,
          status: cancelledOrder.status,
          paymentStatus: cancelledOrder.paymentStatus,
          isPurchaseCompleted: false,
          cancelledAt: cancelledOrder.updatedAt
        },
        'Orden pendiente de pago cancelada correctamente'
      );
    } catch (error) {
      return this.sendError(res, 'No se pudo cancelar la orden pendiente de pago', 500, error);
    }
  }

  async updateOrderStatus(req, res) {
    try {
      const orderId = Number(req.params.id);
      const { status } = req.body;

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return this.sendError(res, 'ID de orden invalido', 400);
      }

      const allowedStatuses = this.getAllowedOrderStatuses();
      if (!allowedStatuses.includes(status)) {
        return this.sendError(res, 'Estado invalido. Permitidos: pending, delivered, cancelled', 400);
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: { select: { id: true, zoneId: true } },
          items: true
        }
      });

      if (!order || order.status === 'cart') {
        return this.sendError(res, 'Orden no encontrada', 404);
      }
      if (order.user.zoneId !== req.user?.zoneId) {
        return this.sendError(res, 'No podes modificar ordenes fuera de tu zona', 403);
      }
      if (order.status === status) {
        return this.sendSuccess(res, { id: order.id, status: order.status }, 'El estado de la orden no cambio');
      }
      if (order.status !== 'pending') {
        return this.sendError(res, `No se puede cambiar el estado desde ${order.status}`, 409);
      }
      if (status === 'pending') {
        return this.sendError(res, 'No se puede transicionar de pending a pending', 400);
      }

      const updatedOrder = await prisma.$transaction(async (tx) => {
        if (status === 'cancelled' && order.paymentStatus === 'approved') {
          for (const item of order.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } }
            });
          }
        }
        return tx.order.update({
          where: { id: order.id },
          data: { status }
        });
      });

      return this.sendSuccess(
        res,
        { id: updatedOrder.id, status: updatedOrder.status, paymentStatus: updatedOrder.paymentStatus },
        'Estado de la orden actualizado correctamente'
      );
    } catch (error) {
      return this.sendError(res, 'No se pudo actualizar el estado de la orden', 500, error);
    }
  }

  async getOrderPaymentStatus(req, res) {
    try {
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return this.sendError(res, 'ID de orden invalido', 400);
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: { select: { id: true, zoneId: true } } }
      });

      if (!order || order.status === 'cart') {
        return this.sendError(res, 'Orden no encontrada', 404);
      }

      const role = req.user?.role;
      const sameZone = order.user.zoneId === req.user?.zoneId;
      const isOwner = order.user.id === req.user?.id;

      if (role === 'admin' || role === 'seller') {
        if (!sameZone) return this.sendError(res, 'La orden pertenece a otra zona', 403);
      } else if (!isOwner) {
        return this.sendError(res, 'No tenes permiso para ver esta orden', 403);
      }

      return this.sendSuccess(
        res,
        {
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          isPurchaseCompleted: order.paymentStatus === 'approved' && order.status !== 'cancelled',
          payment: {
            provider: order.paymentProvider,
            preferenceId: order.mpPreferenceId,
            paymentId: order.mpPaymentId,
            merchantOrderId: order.mpMerchantOrderId,
            externalReference: order.mpExternalReference,
            initPoint: order.mpInitPoint,
            paymentUpdatedAt: order.paymentUpdatedAt
          },
          total: order.total,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        },
        'Estado de pago de la orden obtenido correctamente'
      );
    } catch (error) {
      return this.sendError(res, 'No se pudo obtener el estado de pago de la orden', 500, error);
    }
  }
}

module.exports = OrderController;
