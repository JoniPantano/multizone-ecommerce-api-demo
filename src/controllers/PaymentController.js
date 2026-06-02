const BaseController = require('./BaseController');
const prisma = require('../config/prisma');
const config = require('../config/config');
const mercadoPagoService = require('../services/mercadoPagoService');

class PaymentController extends BaseController {
  async runPaymentTransaction(work) {
    return prisma.$transaction(work, {
      maxWait: 10000,
      timeout: 30000
    });
  }

  async lockOrderScope(tx, orderId) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BigInt(orderId)})`;
  }

  async isDirectOrder(tx, orderId) {
    const directOrderMarker = await tx.idempotencyRequest.findFirst({
      where: {
        orderId,
        action: 'direct_order'
      },
      select: { id: true }
    });

    return Boolean(directOrderMarker);
  }

  async removePurchasedItemsFromCart(tx, userId, orderId) {
    const cartOrder = await tx.order.findFirst({
      where: {
        userId,
        status: 'cart'
      },
      include: {
        items: true
      }
    });

    if (!cartOrder || cartOrder.items.length === 0) {
      return false;
    }

    const purchasedItems = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        productId: true,
        quantity: true
      }
    });

    if (purchasedItems.length === 0) {
      return false;
    }

    const purchasedQtyByProduct = new Map();
    for (const item of purchasedItems) {
      const current = purchasedQtyByProduct.get(item.productId) || 0;
      purchasedQtyByProduct.set(item.productId, current + item.quantity);
    }

    for (const cartItem of cartOrder.items) {
      const qtyToConsume = purchasedQtyByProduct.get(cartItem.productId) || 0;
      if (qtyToConsume <= 0) continue;

      if (cartItem.quantity <= qtyToConsume) {
        await tx.orderItem.delete({
          where: { id: cartItem.id }
        });
        purchasedQtyByProduct.set(cartItem.productId, qtyToConsume - cartItem.quantity);
      } else {
        await tx.orderItem.update({
          where: { id: cartItem.id },
          data: {
            quantity: cartItem.quantity - qtyToConsume
          }
        });
        purchasedQtyByProduct.set(cartItem.productId, 0);
      }
    }

    const remainingItems = await tx.orderItem.findMany({
      where: {
        orderId: cartOrder.id
      },
      select: {
        quantity: true,
        price: true
      }
    });

    const newTotal = remainingItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
    await tx.order.update({
      where: { id: cartOrder.id },
      data: {
        total: newTotal,
        updatedAt: new Date()
      }
    });

    return true;
  }

  async applyApprovedStockReservation(tx, orderId) {
    const orderWithItems = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!orderWithItems || orderWithItems.status === 'cart') {
      const notFound = new Error('Orden no encontrada para reserva de stock');
      notFound.httpStatus = 404;
      throw notFound;
    }
    if (orderWithItems.status !== 'pending') {
      const invalidOrderState = new Error('La reserva de stock solo puede aplicarse a ordenes pendientes');
      invalidOrderState.httpStatus = 409;
      throw invalidOrderState;
    }

    for (const item of orderWithItems.items) {
      const updated = await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: item.quantity }
        },
        data: {
          stock: { decrement: item.quantity }
        }
      });

      if (updated.count === 0) {
        const stockError = new Error(
          `Stock insuficiente al aprobar pago para ${item.product?.name || `producto ${item.productId}`}`
        );
        stockError.httpStatus = 409;
        throw stockError;
      }
    }
  }

  async syncOrderPayment(tx, orderId, payment) {
    await this.lockOrderScope(tx, orderId);

    const currentOrder = await tx.order.findUnique({
      where: { id: orderId }
    });

    if (!currentOrder || currentOrder.status === 'cart') {
      return {
        updated: false,
        reason: 'order_not_found'
      };
    }

    const nextPaymentStatus = mercadoPagoService.mapPaymentStatus(payment.status);
    const transitionAllowed = mercadoPagoService.isAllowedPaymentStatusTransition(
      currentOrder.paymentStatus,
      nextPaymentStatus
    );

    if (!transitionAllowed) {
      return {
        updated: false,
        reason: 'invalid_payment_status_transition',
        current: currentOrder.paymentStatus,
        next: nextPaymentStatus
      };
    }

    const shouldReserveStockNow = currentOrder.status === 'pending'
      && currentOrder.paymentStatus !== 'approved'
      && nextPaymentStatus === 'approved';
    const shouldCancelOrderNow = currentOrder.status === 'pending'
      && ['rejected', 'cancelled'].includes(nextPaymentStatus);
    const targetOrderStatus = shouldCancelOrderNow ? 'cancelled' : currentOrder.status;
    const targetPaymentId = payment.id ? String(payment.id) : currentOrder.mpPaymentId;
    const targetMerchantOrderId = payment.order?.id ? String(payment.order.id) : currentOrder.mpMerchantOrderId;

    const alreadySynced = currentOrder.status === targetOrderStatus
      && currentOrder.paymentStatus === nextPaymentStatus
      && String(currentOrder.mpPaymentId || '') === String(targetPaymentId || '')
      && String(currentOrder.mpMerchantOrderId || '') === String(targetMerchantOrderId || '');

    if (!shouldReserveStockNow && alreadySynced) {
      return {
        updated: false,
        reason: 'already_synced',
        current: currentOrder.paymentStatus
      };
    }

    if (shouldReserveStockNow) {
      await this.applyApprovedStockReservation(tx, currentOrder.id);
    }

    await tx.order.update({
      where: { id: currentOrder.id },
      data: {
        status: targetOrderStatus,
        paymentStatus: nextPaymentStatus,
        mpPaymentId: targetPaymentId,
        mpMerchantOrderId: targetMerchantOrderId,
        paymentUpdatedAt: new Date()
      }
    });

    if (shouldReserveStockNow) {
      const isDirect = await this.isDirectOrder(tx, currentOrder.id);
      if (!isDirect) {
        await this.removePurchasedItemsFromCart(tx, currentOrder.userId, currentOrder.id);
      }
    }

    return {
      updated: true,
      reason: 'updated',
      previous: currentOrder.paymentStatus,
      current: nextPaymentStatus,
      reservedStock: shouldReserveStockNow
    };
  }

  async getPublicConfig(req, res) {
    return this.sendSuccess(res, {
      provider: 'mercadopago',
      publicKey: config.mercadoPago.publicKey || null,
      currency: config.mercadoPago.currency,
      webhookConfigured: Boolean(config.mercadoPago.webhookUrl),
      credentialsConfigured: mercadoPagoService.isConfigured()
    }, 'Configuracion de pagos obtenida correctamente');
  }

  async webhook(req, res) {
    try {
      const eventType = req.query.type || req.body?.type || req.query.topic || null;
      const resourceId = req.query['data.id'] || req.body?.data?.id || req.query.id || null;
      const providerEventId = mercadoPagoService.buildWebhookEventId(req, eventType, resourceId);

      if (!resourceId) {
        return res.status(202).json({ received: true, ignored: true, reason: 'missing_payment_id' });
      }

      if (!mercadoPagoService.isConfigured()) {
        return res.status(202).json({ received: true, ignored: true, reason: 'mp_not_configured' });
      }

      if (eventType && !String(eventType).includes('payment')) {
        return res.status(202).json({ received: true, ignored: true, reason: 'unsupported_event_type' });
      }

      const signatureValid = mercadoPagoService.verifyWebhookSignature(req, String(resourceId));
      if (!signatureValid) {
        console.warn(`[MP webhook] signature invalid event=${providerEventId} resource=${resourceId}`);
        return res.status(401).json({ received: false, message: 'Firma de webhook invalida' });
      }

      const existingEvent = await prisma.paymentWebhookEvent.findUnique({
        where: { providerEventId }
      });
      if (existingEvent) {
        return res.status(200).json({ received: true, ignored: true, reason: 'duplicate_event' });
      }

      let payment;
      try {
        payment = await mercadoPagoService.getPaymentById(resourceId);
      } catch (_paymentFetchError) {
        await prisma.paymentWebhookEvent.create({
          data: {
            provider: 'mercadopago',
            providerEventId,
            eventType: eventType ? String(eventType) : null,
            resourceId: String(resourceId),
            payload: req.body || null
          }
        });
        console.warn(`[MP webhook] ignored resource=${resourceId} reason=payment_not_found_or_unreachable`);
        return res.status(202).json({ received: true, ignored: true, reason: 'payment_not_found_or_unreachable' });
      }

      const externalReference = payment.external_reference ? String(payment.external_reference) : null;
      const orderId = Number(externalReference);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        await prisma.paymentWebhookEvent.create({
          data: {
            provider: 'mercadopago',
            providerEventId,
            eventType: eventType ? String(eventType) : null,
            resourceId: String(resourceId),
            payload: req.body || null
          }
        });
        return res.status(202).json({ received: true, ignored: true, reason: 'invalid_external_reference' });
      }

      let syncResult = null;
      try {
        await this.runPaymentTransaction(async (tx) => {
          await tx.paymentWebhookEvent.create({
            data: {
              provider: 'mercadopago',
              providerEventId,
              eventType: eventType ? String(eventType) : null,
              resourceId: String(resourceId),
              payload: req.body || null,
              orderId
            }
          });

          syncResult = await this.syncOrderPayment(tx, orderId, payment);
        });
      } catch (txError) {
        if (txError.code === 'P2002') {
          return res.status(200).json({ received: true, ignored: true, reason: 'duplicate_event' });
        }
        if (txError.httpStatus === 409) {
          console.error(`[MP webhook] stock conflict order=${orderId}: ${txError.message}`);
          return res.status(409).json({ received: false, message: 'No hay stock suficiente para confirmar la compra' });
        }
        throw txError;
      }

      if (!syncResult?.updated) {
        return res.status(200).json({
          received: true,
          updated: false,
          ignored: true,
          reason: syncResult?.reason || 'unknown'
        });
      }

      console.log(
        `[MP webhook] updated order=${orderId} paymentId=${String(payment.id)} status=${syncResult.current}`
      );
      return res.status(200).json({ received: true, updated: true, orderId });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(200).json({ received: true, ignored: true, reason: 'duplicate_event' });
      }
      console.error('Mercado Pago webhook error:', error.message);
      return res.status(500).json({ received: false, message: 'Fallo el procesamiento del webhook' });
    }
  }

  async reconcilePendingPayments(req, res) {
    try {
      if (!mercadoPagoService.isConfigured()) {
        return this.sendError(res, 'Las credenciales de Mercado Pago no estan configuradas', 400);
      }

      const requestedLimit = Number(req.query.limit || 25);
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 25;

      const pendingOrders = await prisma.order.findMany({
        where: {
          status: 'pending',
          paymentProvider: 'mercadopago',
          paymentStatus: {
            in: ['pending_payment', 'preference_created']
          }
        },
        orderBy: { updatedAt: 'asc' },
        take: limit
      });

      const summary = {
        scanned: pendingOrders.length,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        errors: 0,
        details: []
      };

      for (const order of pendingOrders) {
        try {
          let payment = null;

          if (order.mpPaymentId) {
            payment = await mercadoPagoService.getPaymentById(order.mpPaymentId);
          } else {
            const reference = order.mpExternalReference || String(order.id);
            const payments = await mercadoPagoService.searchPaymentsByExternalReference(reference, 5);
            payment = payments[0] || null;
          }

          if (!payment) {
            summary.skipped += 1;
            summary.details.push({ orderId: order.id, result: 'skipped', reason: 'payment_not_found' });
            continue;
          }

          let syncResult = null;
          await this.runPaymentTransaction(async (tx) => {
            syncResult = await this.syncOrderPayment(tx, order.id, payment);
          });

          if (!syncResult?.updated) {
            summary.unchanged += 1;
            summary.details.push({
              orderId: order.id,
              result: 'unchanged',
              reason: syncResult?.reason || 'unknown',
              current: syncResult?.current || order.paymentStatus
            });
            continue;
          }

          summary.updated += 1;
          summary.details.push({
            orderId: order.id,
            result: 'updated',
            previous: syncResult.previous,
            current: syncResult.current
          });
        } catch (orderError) {
          summary.errors += 1;
          summary.details.push({
            orderId: order.id,
            result: 'error',
            reason: orderError.message
          });
        }
      }

      return this.sendSuccess(res, summary, 'Reconciliacion de pagos pendientes completada');
    } catch (error) {
      return this.sendError(res, 'No se pudieron reconciliar los pagos pendientes', 500, error);
    }
  }
}

module.exports = PaymentController;
