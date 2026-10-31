import { tokenService } from '../services/token.service.js';
import { AppError } from '../utils/AppError.js';

/** Requires a valid bearer access token and attaches `req.user`. */
export function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized());
  }
  try {
    const { userId, roles, permissions } = tokenService.verifyAccessToken(token);
    req.user = { id: userId, roles, permissions };
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Grants access when the authenticated user holds at least one of the given roles. */
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    const granted = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!granted) return next(AppError.forbidden());
    return next();
  };
}

/** Grants access when the session carries every requested database-assigned permission. */
export function requirePermission(...requiredPermissions) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    const granted = requiredPermissions.every((permission) => req.user.permissions?.includes(permission));
    if (!granted) return next(AppError.forbidden());
    return next();
  };
}

/**
 * Attaches `req.user` when a valid token is present, and continues as a guest otherwise. Used by public
 * pages that personalise a little (wishlist state) without requiring sign-in.
 */
export function optionalAuthenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const { userId, roles, permissions } = tokenService.verifyAccessToken(token);
      req.user = { id: userId, roles, permissions };
    } catch {
      // An expired token on a public page is treated as a guest, not an error.
    }
  }
  return next();
}
