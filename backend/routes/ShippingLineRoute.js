import express from "express";

import ShippingLine from "../models/ShippingLine.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

// Check whether a webhook URL uses HTTP or HTTPS.
function isValidWebhookUrl(value) {
  try {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

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

      if (typeof name !== "string" || typeof code !== "string") {
        return res.status(400).json({
          message: "Shipping line name and code must be text.",
        });
      }

      if (
        webhookUrl !== undefined &&
        typeof webhookUrl !== "string"
      ) {
        return res.status(400).json({
          message: "Webhook URL must be text.",
        });
      }

      const normalizedName = name.trim();
      const normalizedCode = code.trim().toUpperCase();
      const normalizedWebhookUrl = webhookUrl
        ? webhookUrl.trim()
        : "";

      if (!normalizedName || !normalizedCode) {
        return res.status(400).json({
          message: "Shipping line name and code cannot be empty.",
        });
      }

      // Validate the webhook URL when one is provided.
      if (
        normalizedWebhookUrl &&
        !isValidWebhookUrl(normalizedWebhookUrl)
      ) {
        return res.status(400).json({
          message: "Webhook URL must be a valid HTTP or HTTPS URL.",
        });
      }

      // Check whether another shipping line uses the same name or code.
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

      // Create the shipping line.
      const shippingLine = await ShippingLine.create({
        name: normalizedName,
        code: normalizedCode,
        webhookUrl: normalizedWebhookUrl,
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

    const shippingLineQuery = ShippingLine.find(filter);
    if (req.user.role !== "ADMIN") shippingLineQuery.select("-webhookUrl");

    const shippingLines = await shippingLineQuery
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

    const shippingLineQuery = ShippingLine.findById(id);
    if (req.user.role !== "ADMIN") shippingLineQuery.select("-webhookUrl");

    const shippingLine = await shippingLineQuery
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
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({
            message: "Shipping line name must be valid text.",
          });
        }

        updates.name = name.trim();
      }

      if (code !== undefined) {
        if (typeof code !== "string" || !code.trim()) {
          return res.status(400).json({
            message: "Shipping line code must be valid text.",
          });
        }

        updates.code = code.trim().toUpperCase();
      }

      if (webhookUrl !== undefined) {
        if (typeof webhookUrl !== "string") {
          return res.status(400).json({
            message: "Webhook URL must be text.",
          });
        }

        const normalizedWebhookUrl = webhookUrl.trim();

        // Allow an empty URL to remove the configured endpoint.
        if (
          normalizedWebhookUrl &&
          !isValidWebhookUrl(normalizedWebhookUrl)
        ) {
          return res.status(400).json({
            message: "Webhook URL must be a valid HTTP or HTTPS URL.",
          });
        }

        updates.webhookUrl = normalizedWebhookUrl;
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

      // Update the shipping line.
      const shippingLine = await ShippingLine.findByIdAndUpdate(
        id,
        updates,
        { returnDocument: "after", runValidators: true },
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
        { returnDocument: "after", runValidators: true },
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
