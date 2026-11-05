
import express from "express";

import Port from "../models/Port.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

// POST /api/ports
// Admin only.
// Accepts name, code, and location.
// Creates a new port and records the Admin who created it.
router.post(
  "/",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { name, code, location } = req.body;

      if (!name || !code || !location) {
        return res.status(400).json({
          message: "Port name, code, and location are required.",
        });
      }

      const normalizedName = name.trim();
      const normalizedCode = code.trim().toUpperCase();

      const existingPort = await Port.findOne({
        $or: [
          { name: normalizedName },
          { code: normalizedCode },
        ],
      });

      if (existingPort) {
        return res.status(409).json({
          message: "A port with this name or code already exists.",
        });
      }

      const port = await Port.create({
        name: normalizedName,
        code: normalizedCode,
        location: location.trim(),
        createdBy: req.user._id,
      });

      return res.status(201).json({
        message: "Port created successfully.",
        port,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/ports
// Authenticated users.
// Accepts optional ?isActive=true or ?isActive=false.
// Returns ports for dropdowns and management screens.
router.get("/", AuthMiddleware, async (req, res, next) => {
  try {
    const { isActive } = req.query;

    const filter = {};

    if (isActive !== undefined) {
      if (!["true", "false"].includes(isActive)) {
        return res.status(400).json({
          message: "isActive must be true or false.",
        });
      }

      filter.isActive = isActive === "true";
    }

    const ports = await Port.find(filter)
      .populate("createdBy", "fullName email")
      .sort({ name: 1 });

    return res.status(200).json({
      count: ports.length,
      ports,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/ports/:id
// Authenticated users.
// Returns details of one port by its MongoDB ID.
router.get("/:id", AuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: "Invalid port ID.",
      });
    }

    const port = await Port.findById(id)
      .populate("createdBy", "fullName email");

    if (!port) {
      return res.status(404).json({
        message: "Port not found.",
      });
    }

    return res.status(200).json({ port });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/ports/:id
// Admin only.
// Accepts name, code, and location.
// Updates the information of an existing port.
router.patch(
  "/:id",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, code, location } = req.body;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid port ID.",
        });
      }

      const updates = {};

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            message: "Port name cannot be empty.",
          });
        }
        updates.name = name.trim();
      }

      if (code !== undefined) {
        if (!code.trim()) {
          return res.status(400).json({
            message: "Port code cannot be empty.",
          });
        }
        updates.code = code.trim().toUpperCase();
      }

      if (location !== undefined) {
        if (!location.trim()) {
          return res.status(400).json({
            message: "Port location cannot be empty.",
          });
        }
        updates.location = location.trim();
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: "No valid fields provided for update.",
        });
      }

      // Check whether another port already uses this name or code.
      const duplicatePort = await Port.findOne({
        $and: [
          { _id: { $ne: id } },
          {
            $or: [
              ...(updates.name ? [{ name: updates.name }] : []),
              ...(updates.code ? [{ code: updates.code }] : []),
            ],
          },
        ],
      });

      if (duplicatePort) {
        return res.status(409).json({
          message: "Another port already uses this name or code.",
        });
      }

      const port = await Port.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });

      if (!port) {
        return res.status(404).json({
          message: "Port not found.",
        });
      }

      return res.status(200).json({
        message: "Port updated successfully.",
        port,
      });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/ports/:id/status
// Admin only.
// Accepts isActive: true or false.
// Activates or deactivates a port without deleting its records.
router.patch(
  "/:id/status",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid port ID.",
        });
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          message: "isActive must be true or false.",
        });
      }

      const port = await Port.findByIdAndUpdate(
        id,
        { isActive },
        { new: true, runValidators: true },
      );

      if (!port) {
        return res.status(404).json({
          message: "Port not found.",
        });
      }

      return res.status(200).json({
        message: `Port ${isActive ? "activated" : "deactivated"} successfully.`,
        port,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
