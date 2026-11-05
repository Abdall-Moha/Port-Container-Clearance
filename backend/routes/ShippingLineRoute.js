
import express from "express";

import ShippingLine from "../models/ShippingLine.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

// POST /api/shipping-lines
// Admin only.
// Accepts name, code, and optional webhookUrl.
// Creates a new shipping line.
router.post(
  "/",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { name, code, webhookUrl } = req.body;

      if (!name || !code) {
        return res.status(400).json({
          message: "Shipping line name and code are required.",
        });
      }

      const normalizedName = name.trim();
      const normalizedCode = code.trim().toUpperCase();

      const existingShippingLine = await ShippingLine.findOne({
        $or: [
          { name: normalizedName },
          { code: normalizedCode },
        ],
      });

      if (existingShippingLine) {
        return res.status(409).json({
          message: "A shipping line with this name or code already exists.",
        });
      }

      const shippingLine = await ShippingLine.create({
        name: normalizedName,
        code: normalizedCode,
        webhookUrl: webhookUrl ? webhookUrl.trim() : "",
        createdBy: req.user._id,
      });

      return res.status(201).json({
        message: "Shipping line created successfully.",
        shippingLine,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/shipping-lines
// Authenticated users.
// Accepts optional ?isActive=true or ?isActive=false.
// Returns shipping lines for dropdowns and management screens.
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

    const shippingLines = await ShippingLine.find(filter)
      .populate("createdBy", "fullName email")
      .sort({ name: 1 });

    return res.status(200).json({
      count: shippingLines.length,
      shippingLines,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/shipping-lines/:id
// Authenticated users.
// Returns details of one shipping line.
router.get("/:id", AuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: "Invalid shipping line ID.",
      });
    }

    const shippingLine = await ShippingLine.findById(id)
      .populate("createdBy", "fullName email");

    if (!shippingLine) {
      return res.status(404).json({
        message: "Shipping line not found.",
      });
    }

    return res.status(200).json({ shippingLine });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/shipping-lines/:id
// Admin only.
// Accepts name, code, and webhookUrl.
// Updates an existing shipping line.
router.patch(
  "/:id",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, code, webhookUrl } = req.body;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid shipping line ID.",
        });
      }

      const updates = {};

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            message: "Shipping line name cannot be empty.",
          });
        }
        updates.name = name.trim();
      }

      if (code !== undefined) {
        if (!code.trim()) {
          return res.status(400).json({
            message: "Shipping line code cannot be empty.",
          });
        }
        updates.code = code.trim().toUpperCase();
      }

      if (webhookUrl !== undefined) {
        updates.webhookUrl = webhookUrl.trim();
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: "No valid fields provided for update.",
        });
      }

      // Check for duplicate names or codes before updating.
      const duplicateShippingLine = await ShippingLine.findOne({
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

      if (duplicateShippingLine) {
        return res.status(409).json({
          message: "Another shipping line already uses this name or code.",
        });
      }

      const shippingLine = await ShippingLine.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true },
      );

      if (!shippingLine) {
        return res.status(404).json({
          message: "Shipping line not found.",
        });
      }

      return res.status(200).json({
        message: "Shipping line updated successfully.",
        shippingLine,
      });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/shipping-lines/:id/status
// Admin only.
// Accepts isActive: true or false.
// Activates or deactivates a shipping line without deleting it.
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
          message: "Invalid shipping line ID.",
        });
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          message: "isActive must be true or false.",
        });
      }

      const shippingLine = await ShippingLine.findByIdAndUpdate(
        id,
        { isActive },
        { new: true, runValidators: true },
      );

      if (!shippingLine) {
        return res.status(404).json({
          message: "Shipping line not found.",
        });
      }

      return res.status(200).json({
        message: `Shipping line ${isActive ? "activated" : "deactivated"} successfully.`,
        shippingLine,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
