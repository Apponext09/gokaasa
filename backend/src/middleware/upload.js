import multer from 'multer';
import path from 'node:path';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { ALLOWED_IMAGE_TYPES } from '../utils/imageSignature.js';

const ALLOWED_MIME = new Set(ALLOWED_IMAGE_TYPES.map((type) => type.mime));
const ALLOWED_EXT = new Set(ALLOWED_IMAGE_TYPES.map((type) => `.${type.ext}`).concat('.jpeg'));

// Files stay in memory only long enough to be validated and handed to storage. They never touch
// the filesystem under their client-supplied name.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.maxUploadBytes, files: 1, fields: 5, parts: 6 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname ?? '').toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(extension)) {
      return callback(AppError.unsupportedMediaType('Only JPEG, PNG and WebP images are accepted'));
    }
    return callback(null, true);
  },
});

/** Accepts one multipart field named "image". Maps multer's errors onto the API's error format. */
export function uploadSingleImage(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(AppError.payloadTooLarge(`Images must be ${Math.round(config.media.maxUploadBytes / (1024 * 1024))} MB or smaller`));
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
      return next(AppError.badRequest('Upload one image at a time using the "image" field'));
    }
    return next(error instanceof AppError ? error : AppError.badRequest('The upload could not be read'));
  });
}
