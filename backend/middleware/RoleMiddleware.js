
 // Checks whether the authenticated user's role is permitted.
 // Receives the allowed roles as arguments.
 // Returns 403 if the user's role is not authorized.
function RoleMiddleware(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
      });
    }

    next();
  };
}

export default RoleMiddleware;
