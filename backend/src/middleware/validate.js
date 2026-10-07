import { AppError } from '../utils/AppError.js';

/**
 * Validates body, query and params against zod schemas. Parsed (and coerced) values are
 * available as `req.validated.{body,query,params}`; raw input is never trusted directly.
 */
export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    const result = {};
    const issues = [];

    for (const [source, schema] of Object.entries({ body, query, params })) {
      if (!schema) continue;
      const parsed = schema.safeParse(req[source] ?? {});
      if (parsed.success) {
        result[source] = parsed.data;
      } else {
        for (const issue of parsed.error.issues) {
          issues.push({ field: [source, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (issues.length > 0) {
      return next(AppError.unprocessable('Please correct the highlighted fields', issues));
    }

    // Merge rather than replace: several validate() calls can run on one request (e.g. params, then a multipart body).
    req.validated = { ...(req.validated ?? {}), ...result };
    return next();
  };
}
