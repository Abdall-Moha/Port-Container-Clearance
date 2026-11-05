
 // Handles errors passed through Express using next(error).
 // Receives the error, request, response, and next function.
 // Returns a suitable HTTP status and safe error message.
function ErrorMiddleware(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  // Log the full error on the server for debugging.
  console.error(error);

  // Send a safe message to the client.
  res.status(statusCode).json({
    message:
      statusCode === 500
        ? "Internal server error. Please try again later."
        : error.message,
  });
}

export default ErrorMiddleware;
