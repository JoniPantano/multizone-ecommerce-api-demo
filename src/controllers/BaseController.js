/**
 * Base Controller class for handling HTTP requests
 * This class provides common response methods that can be inherited by specific controllers
 */
class BaseController {
  /**
   * Send a success response
   */
  sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
    res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }

  /**
   * Send a paginated success response
   */
  sendPaginatedSuccess(res, data = [], total = 0, page = 1, pageSize = 10) {
    res.status(200).json({
      success: true,
      message: 'Success',
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  }

  /**
   * Send an error response
   */
  sendError(res, message = 'Error', statusCode = 400, error = null) {
    const details =
      error &&
      typeof error === 'object' &&
      !(error instanceof Error)
        ? error
        : null;

    res.status(statusCode).json({
      success: false,
      message,
      ...(details && { details }),
      ...(process.env.NODE_ENV === 'development' && error && { error })
    });
  }

  /**
   * Validate required fields
   */
  validateRequired(data, requiredFields) {
    const missing = requiredFields.filter(field => !data[field] && data[field] !== 0);
    if (missing.length > 0) {
      return {
        isValid: false,
        message: `Missing required fields: ${missing.join(', ')}`
      };
    }
    return { isValid: true };
  }

  isEmail(value) {
    return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  isPositiveNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  isPositiveInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }
}

module.exports = BaseController;
