import { AppError } from '../utils/AppError.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const log = createLogger('http');

// Postgres error codes that map to a client-meaningful response.
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';

export function notFound(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} was not found`));
}

/**
 * Last-stop error handler. Known errors get their status and message; everything else is logged
 * server-side and returned as a generic message. SQL text, stacks and provider credentials never leave the server.
 */
export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
  }

  if (error?.code === PG_UNIQUE_VIOLATION) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'This record already exists' } });
  }
  if (error?.code === PG_FOREIGN_KEY_VIOLATION) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'This record is referenced by other data' } });
  }

  // A check constraint is a rule the request broke, not a server fault.
  if (error?.code === PG_CHECK_VIOLATION) {
    return res.status(422).json({ error: { code: 'UNPROCESSABLE', message: 'One of the values is outside the allowed limits' } });
  }

  log.error('unhandled error', {
    method: req.method,
    path: req.originalUrl,
    message: error?.message,
    ...(config.isProduction ? {} : { stack: error?.stack }),
  });

  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' },
  });
}
