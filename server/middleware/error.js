export class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON request body';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((item) => ({ field: item.path, message: item.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'A record with that value already exists';
    details = Object.keys(err.keyPattern || {});
  }

  if (status >= 500) console.error(err);
  res.status(status).json({ error: message, ...(details ? { details } : {}) });
}
