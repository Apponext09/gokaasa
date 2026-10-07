/**
 * Expected, client-safe error. Anything that is not an AppError is treated
 * as an internal failure and reported to the client with a generic message.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message, details) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static unprocessable(message, details) {
    return new AppError(422, 'UNPROCESSABLE', message, details);
  }

  static payloadTooLarge(message = 'The file is too large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
  }

  static unsupportedMediaType(message = 'This file type is not supported') {
    return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static serviceUnavailable(message = 'This service is temporarily unavailable') {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message);
  }
}
