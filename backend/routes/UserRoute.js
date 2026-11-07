
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import User from "../models/User.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";
import { loginRateLimit } from "../middleware/RateLimitingMiddleware.js";

const router = express.Router();

// Generates a JWT token after successful authentication.
// Receives the user's MongoDB ID.
// Returns a signed token with an expiration time.
function generateToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" },
  );
}

// POST /api/users/login
// Public endpoint.
// Accepts email and password.
// Returns a JWT and safe user information.
// Rejects invalid credentials and inactive accounts.
router.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    // Password is excluded by default, so we explicitly request it.
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password");

    // Use the same message for both cases to avoid revealing
    // whether an email address exists in the database.
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account is inactive. Contact Admin.",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/users
// Admin only.
// Accepts fullName, email, password, phone, role, preferredLanguage.
// Creates Importer, Clearing Agent, or Customs Officer accounts.
// Returns the created user's safe information.
router.post(
  "/",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const {
        fullName,
        email,
        password,
        phone,
        role,
        preferredLanguage,
      } = req.body;

      if (!fullName || !email || !password || !role) {
        return res.status(400).json({
          message: "Full name, email, password, and role are required.",
        });
      }

      // Admin accounts cannot be created through this endpoint.
      const allowedRoles = [
        "IMPORTER",
        "CLEARING_AGENT",
        "CUSTOMS_OFFICER",
      ];

      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          message: "Invalid role. Admin accounts cannot be created here.",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          message: "Password must contain at least 8 characters.",
        });
      }

      if (
        preferredLanguage &&
        !["en", "so"].includes(preferredLanguage)
      ) {
        return res.status(400).json({
          message: "Preferred language must be en or so.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await User.findOne({
        email: normalizedEmail,
      });

      if (existingUser) {
        return res.status(409).json({
          message: "A user with this email already exists.",
        });
      }

      const newUser = await User.create({
        fullName,
        email: normalizedEmail,
        password,
        phone,
        role,
        preferredLanguage: preferredLanguage || "en",
        isActive: true,
        createdBy: req.user._id,
      });

      return res.status(201).json({
        message: "User created successfully.",
        user: {
          id: newUser._id,
          fullName: newUser.fullName,
          email: newUser.email,
          phone: newUser.phone,
          role: newUser.role,
          isActive: newUser.isActive,
          preferredLanguage: newUser.preferredLanguage,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/users/active-importers
// Clearing Agents only. Return active Importer names and IDs for Bill of Lading creation.
router.get(
  "/active-importers",
  AuthMiddleware,
  RoleMiddleware("CLEARING_AGENT"),
  async (req, res, next) => {
    try {
      const users = await User.find({
        role: "IMPORTER",
        isActive: true,
      })
        .select("_id fullName")
        .sort({ fullName: 1 })
        .lean();

      return res.status(200).json({
        count: users.length,
        users,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/users/active-clearing-agents
// Importers only. Return active Clearing Agent names and IDs for assignment.
router.get(
  "/active-clearing-agents",
  AuthMiddleware,
  RoleMiddleware("IMPORTER"),
  async (req, res, next) => {
    try {
      const users = await User.find({
        role: "CLEARING_AGENT",
        isActive: true,
      })
        .select("_id fullName")
        .sort({ fullName: 1 })
        .lean();

      return res.status(200).json({ count: users.length, users });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/users
// Admin only.
// Optionally accepts ?role=IMPORTER to filter users by role.
// Returns users without their passwords.
router.get(
  "/",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { role } = req.query;

      const allowedRoles = [
        "ADMIN",
        "IMPORTER",
        "CLEARING_AGENT",
        "CUSTOMS_OFFICER",
      ];

      if (role && !allowedRoles.includes(role)) {
        return res.status(400).json({
          message: "Invalid role filter.",
        });
      }

      const filter = role ? { role } : {};

      const users = await User.find(filter).sort({
        createdAt: -1,
      });

      return res.status(200).json({
        count: users.length,
        users,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/users/me
// Authenticated users only.
// Returns the profile of the currently logged-in user.
router.get("/me", AuthMiddleware, async (req, res, next) => {
  try {
    return res.status(200).json({
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
});



 // PATCH /api/users/:id/reset-password
 // Admin only.
 // Accepts newPassword.
 // Allows Admin to reset any user's password without their previous password.
 // Returns success or an appropriate error.
router.patch(
  "/:id/reset-password",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid user ID.",
        });
      }

      if (!newPassword) {
        return res.status(400).json({
          message: "New password is required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message: "Password must contain at least 8 characters.",
        });
      }

      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      // Assigning the plain password here is safe because
      // the User model hashes it automatically before saving.
      user.password = newPassword;

      await user.save();

      return res.status(200).json({
        message: "User password reset successfully.",
      });
    } catch (error) {
      next(error);
    }
  },
);


// PATCH /api/users/:id
// Admin only.
// Accepts fullName, phone, role, isActive, preferredLanguage.
// Updates an existing user without allowing password changes here.
router.patch(
  "/:id",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid user ID.",
        });
      }

      const {
        fullName,
        phone,
        role,
        isActive,
        preferredLanguage,
      } = req.body;

      const updates = {};

      if (fullName !== undefined) {
        if (!fullName.trim()) {
          return res.status(400).json({
            message: "Full name cannot be empty.",
          });
        }
        updates.fullName = fullName.trim();
      }

      if (phone !== undefined) {
        updates.phone = phone.trim();
      }

      if (role !== undefined) {
        const allowedRoles = [
          "ADMIN",
          "IMPORTER",
          "CLEARING_AGENT",
          "CUSTOMS_OFFICER",
        ];

        if (!allowedRoles.includes(role)) {
          return res.status(400).json({
            message: "Invalid user role.",
          });
        }

        updates.role = role;
      }

      if (isActive !== undefined) {
        if (typeof isActive !== "boolean") {
          return res.status(400).json({
            message: "isActive must be true or false.",
          });
        }
        updates.isActive = isActive;
      }

      if (preferredLanguage !== undefined) {
        if (!["en", "so"].includes(preferredLanguage)) {
          return res.status(400).json({
            message: "Preferred language must be en or so.",
          });
        }
        updates.preferredLanguage = preferredLanguage;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: "No valid fields provided for update.",
        });
      }

      const targetUser = await User.findById(id);

      if (!targetUser) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      // Prevent Admin from accidentally removing their own Admin role
      // or deactivating their own account while logged in.
      if (targetUser._id.equals(req.user._id)) {
        if (updates.role && updates.role !== "ADMIN") {
          return res.status(400).json({
            message: "You cannot remove your own Admin role.",
          });
        }

        if (updates.isActive === false) {
          return res.status(400).json({
            message: "You cannot deactivate your own account.",
          });
        }
      }

      // Protect the system from losing its last active Admin.
      const removingAdminAccess =
        targetUser.role === "ADMIN" &&
        (updates.role !== undefined && updates.role !== "ADMIN" ||
          updates.isActive === false);

      if (removingAdminAccess) {
        const activeAdminCount = await User.countDocuments({
          role: "ADMIN",
          isActive: true,
        });

        if (activeAdminCount <= 1) {
          return res.status(400).json({
            message: "The system must have at least one active Admin.",
          });
        }
      }

      Object.assign(targetUser, updates);
      await targetUser.save();

      return res.status(200).json({
        message: "User updated successfully.",
        user: {
          id: targetUser._id,
          fullName: targetUser.fullName,
          email: targetUser.email,
          phone: targetUser.phone,
          role: targetUser.role,
          isActive: targetUser.isActive,
          preferredLanguage: targetUser.preferredLanguage,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/users/change-password
// Authenticated users only.
// Accepts currentPassword and newPassword.
// Changes only the password of the currently logged-in user.
router.patch(
  "/change-password",
  AuthMiddleware,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          message: "Current password and new password are required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message: "New password must contain at least 8 characters.",
        });
      }

      // Fetch the logged-in user's password hash for comparison.
      const user = await User.findById(req.user._id).select("+password");

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      const isPasswordCorrect =
        await user.comparePassword(currentPassword);

      if (!isPasswordCorrect) {
        return res.status(400).json({
          message: "Current password is incorrect.",
        });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          message: "New password must be different from the current password.",
        });
      }

      // The User model automatically hashes this password before saving.
      user.password = newPassword;
      await user.save();

      return res.status(200).json({
        message: "Password changed successfully.",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
