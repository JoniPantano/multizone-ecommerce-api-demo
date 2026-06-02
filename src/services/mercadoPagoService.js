const config = require('../config/config');
const crypto = require('crypto');

class MercadoPagoService {
  constructor() {
    this.baseUrl = config.mercadoPago.baseUrl;
    this.accessToken = config.mercadoPago.accessToken;
    this.currency = config.mercadoPago.currency;
  }

  isConfigured() {
    return Boolean(this.accessToken);
  }

  async createPreference(order, items) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        paymentStatus: 'pending_setup',
        message: 'Las credenciales de Mercado Pago aún no están configuradas'
      };
    }

    const backUrls = {};
    if (config.mercadoPago.successUrl) backUrls.success = config.mercadoPago.successUrl;
    if (config.mercadoPago.failureUrl) backUrls.failure = config.mercadoPago.failureUrl;
    if (config.mercadoPago.pendingUrl) backUrls.pending = config.mercadoPago.pendingUrl;

    const body = {
      items: items.map((item) => ({
        title: item.product?.name || `Product ${item.productId}`,
        quantity: item.quantity,
        unit_price: Number(item.price),
        currency_id: this.currency
      })),
      external_reference: String(order.id),
      metadata: {
        orderId: order.id,
        userId: order.userId
      },
      notification_url: config.mercadoPago.webhookUrl || undefined
    };

    const excludedPaymentTypes = (config.mercadoPago.excludedPaymentTypeIds || [])
      .map((id) => String(id).trim())
      .filter(Boolean)
      .map((id) => ({ id }));
    const excludedPaymentMethods = (config.mercadoPago.excludedPaymentMethodIds || [])
      .map((id) => String(id).trim())
      .filter(Boolean)
      .map((id) => ({ id }));

    if (excludedPaymentTypes.length > 0 || excludedPaymentMethods.length > 0) {
      body.payment_methods = {};
      if (excludedPaymentTypes.length > 0) {
        body.payment_methods.excluded_payment_types = excludedPaymentTypes;
      }
      if (excludedPaymentMethods.length > 0) {
        body.payment_methods.excluded_payment_methods = excludedPaymentMethods;
      }
    }

    if (Object.keys(backUrls).length > 0) {
      body.back_urls = backUrls;
    }

    // Mercado Pago requires back_urls.success when auto_return is set.
    if (backUrls.success) {
      body.auto_return = 'approved';
    }

    const response = await fetch(`${this.baseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.message || payload?.error || 'No se pudo crear la preferencia de Mercado Pago';
      throw new Error(message);
    }

    return {
      configured: true,
      paymentStatus: 'preference_created',
      preferenceId: payload.id,
      initPoint: payload.init_point || null,
      sandboxInitPoint: payload.sandbox_init_point || null,
      externalReference: payload.external_reference || String(order.id)
    };
  }

  async getPaymentById(paymentId) {
    if (!this.isConfigured()) {
      throw new Error('Las credenciales de Mercado Pago no están configuradas');
    }

    const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.message || payload?.error || 'No se pudo obtener el pago';
      throw new Error(message);
    }

    return payload;
  }

  async searchPaymentsByExternalReference(externalReference, limit = 10) {
    if (!this.isConfigured()) {
      throw new Error('Las credenciales de Mercado Pago no están configuradas');
    }

    const params = new URLSearchParams({
      external_reference: String(externalReference),
      sort: 'date_created',
      criteria: 'desc',
      limit: String(limit)
    });

    const response = await fetch(`${this.baseUrl}/v1/payments/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.message || payload?.error || 'No se pudieron buscar los pagos';
      throw new Error(message);
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    return results;
  }

  mapPaymentStatus(mpStatus) {
    const status = String(mpStatus || '').toLowerCase();
    switch (status) {
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      case 'cancelled':
        return 'cancelled';
      case 'refunded':
      case 'charged_back':
        return 'refunded';
      default:
        return 'pending_payment';
    }
  }

  isAllowedPaymentStatusTransition(currentStatus, nextStatus) {
    const current = String(currentStatus || '').toLowerCase();
    const next = String(nextStatus || '').toLowerCase();

    if (!current || current === next) return true;

    const transitions = {
      pending_setup: new Set(['pending_payment', 'preference_created', 'approved', 'rejected', 'cancelled', 'refunded']),
      pending_payment: new Set(['approved', 'rejected', 'cancelled', 'refunded']),
      preference_created: new Set(['pending_payment', 'approved', 'rejected', 'cancelled', 'refunded']),
      approved: new Set(['refunded']),
      rejected: new Set([]),
      cancelled: new Set([]),
      refunded: new Set([]),
    };

    return transitions[current]?.has(next) || false;
  }

  buildWebhookEventId(req, eventType, resourceId) {
    const explicitEventId = req.query.id || req.body?.id || null;
    if (explicitEventId) {
      return `mp:${String(explicitEventId)}`;
    }

    const requestId = req.headers['x-request-id'] || '';
    return `mp:${String(eventType || 'unknown')}:${String(resourceId || 'unknown')}:${String(requestId || 'no-request-id')}`;
  }

  verifyWebhookSignature(req, resourceId) {
    const secret = config.mercadoPago.webhookSecret;
    if (!secret) return true;

    const signatureHeader = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    if (!signatureHeader || !requestId || !resourceId) {
      return false;
    }

    const signatureParts = String(signatureHeader).split(',').map((part) => part.trim());
    const tsPart = signatureParts.find((part) => part.startsWith('ts='));
    const v1Part = signatureParts.find((part) => part.startsWith('v1='));

    if (!tsPart || !v1Part) {
      return false;
    }

    const ts = tsPart.replace('ts=', '');
    const receivedV1 = v1Part.replace('v1=', '').toLowerCase();
    const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
    const expectedV1 = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex')
      .toLowerCase();

    const a = Buffer.from(receivedV1, 'utf8');
    const b = Buffer.from(expectedV1, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}

module.exports = new MercadoPagoService();
