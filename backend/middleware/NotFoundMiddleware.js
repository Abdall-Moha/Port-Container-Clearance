// Handles requests that did not match any registered route and returns a clear 404.
export default function notFoundMiddleware(req, res) {
  return res.status(404).json({ success: false, message: "Route not found." });
}
