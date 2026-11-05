import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Checks the JWT token and identifies the authenticated user.
// Reads the token from the Authorization header.
// Adds the user's safe information to req.user.
// Returns 401 if the token is missing, invalid, expired, or the user is inactive.
async function AuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // The expected format is: Bearer <token>
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required. Please log in.",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify the token using our secret key.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user who owns this token.
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "User account not found.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account is inactive. Contact Admin.",
      });
    }

    // Make the authenticated user's information available to routes.
    req.user = user;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Your session has expired. Please log in again.",
      });
    }

    if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    next(error);
  }
}

export default AuthMiddleware;
