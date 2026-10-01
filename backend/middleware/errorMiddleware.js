// 404 for any route that didn't match.
const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Centralized error handler. Any error passed to next(err), or thrown inside an
// asyncHandler-wrapped controller, ends up here instead of Express's default HTML page.
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  // Lỗi tự ném kèm mã (throw Object.assign(new Error('...'), { status: 404 })).
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) statusCode = err.status;
  let message = err.message || 'Server error';

  // Mongoose bad ObjectId -> 404 instead of a raw 500 cast error.
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }
  // Mongoose duplicate key (unique index) -> 400.
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `${field} already in use` : 'Duplicate value';
  }
  // Mongoose validation errors -> 400 with combined messages.
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
