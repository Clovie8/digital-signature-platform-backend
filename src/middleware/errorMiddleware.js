const errorMiddleware = (err, res) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (err.isOperational) {
    console.warn('[Operational Error]:', err.message);
    return res.status(err.statusCode).json({
      status: err.status,
      error: err.message
    });
  }

  // Programming or other unknown error: don't leak error details
  console.error('ERROR: ', err);
  return res.status(500).json({
    status: 'error',
    error: 'Something went wrong on the server'
  });
};

module.exports = errorMiddleware;
