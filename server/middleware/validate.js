import { AppError } from './error.js';

export function validate(schema, property = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[property]);
    if (!result.success) {
      return next(new AppError('Validation failed', 400, result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }))));
    }
    req[property] = result.data;
    next();
  };
}
