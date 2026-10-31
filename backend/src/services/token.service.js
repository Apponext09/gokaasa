import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';

const ISSUER = 'gokaasa-api';
const AUDIENCE = 'gokaasa-web';

export const tokenService = {
  signAccessToken(user) {
    return jwt.sign({ sub: String(user.id), roles: user.roles, permissions: user.permissions ?? [] }, config.auth.jwtSecret, {
      expiresIn: config.auth.accessTtl,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    });
  },

  verifyAccessToken(token) {
    try {
      const payload = jwt.verify(token, config.auth.jwtSecret, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      return { userId: Number(payload.sub), roles: payload.roles ?? [], permissions: payload.permissions ?? [] };
    } catch {
      throw AppError.unauthorized('Your session has expired. Please sign in again.');
    }
  },
};
