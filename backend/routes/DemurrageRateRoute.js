import express from "express";

import DemurrageRate from "../models/DemurrageRate.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();
const supportedSizes = ["20FT", "40FT"];

// Validate the container size and nonnegative daily amount sent by an Admin.
function validateRateInput(size, dailyRate) {
  if (size !== undefined && !supportedSizes.includes(size)) {
    return "Container size must be 20FT or 40FT.";
  }

  if (dailyRate !== undefined) {
    const isNumericInput = typeof dailyRate === "number" ||
      (typeof dailyRate === "string" && dailyRate.trim() !== "");
    if (!isNumericInput || !Number.isFinite(Number(dailyRate)) || Number(dailyRate) < 0) {
      return "Daily rate must be a valid amount greater than or equal to zero.";
    }
  }

  return "";
}

/*
  GET /api/demurrage-rates

  Admin lists configured rates, including inactive rates.
*/
router.get("/", AuthMiddleware, RoleMiddleware("ADMIN"), async (req, res) => {
  try {
    const rates = await DemurrageRate.find({}).sort({ size: 1 });
    return res.status(200).json({ totalRates: rates.length, rates });
  } catch (error) {
    console.error("Get demurrage rates error:", error);
    return res.status(500).json({ message: "Unable to retrieve demurrage rates." });
  }
});

/*
  POST /api/demurrage-rates

  Admin creates the daily rate for a supported container size.
*/
router.post("/", AuthMiddleware, RoleMiddleware("ADMIN"), async (req, res) => {
  try {
    const { size, dailyRate } = req.body;
    const validationMessage = validateRateInput(size, dailyRate);
    if (validationMessage) return res.status(400).json({ message: validationMessage });
    if (size === undefined || dailyRate === undefined) {
      return res.status(400).json({ message: "Please provide container size and daily rate." });
    }

    const rate = await DemurrageRate.create({
      size,
      dailyRate: Number(dailyRate),
      createdBy: req.user._id,
    });

    return res.status(201).json({ message: "Demurrage rate created successfully.", rate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A demurrage rate already exists for this container size." });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    console.error("Create demurrage rate error:", error);
    return res.status(500).json({ message: "Unable to create the demurrage rate." });
  }
});

/*
  PATCH /api/demurrage-rates/:id

  Admin updates the amount, size, or active status of an existing rate.
*/
router.patch("/:id", AuthMiddleware, RoleMiddleware("ADMIN"), async (req, res) => {
  try {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      return res.status(400).json({ message: "Invalid demurrage rate ID." });
    }

    const { size, dailyRate, isActive } = req.body;
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ message: "Active status must be true or false." });
    }

    const validationMessage = validateRateInput(size, dailyRate);
    if (validationMessage) return res.status(400).json({ message: validationMessage });

    const updates = {};
    if (size !== undefined) updates.size = size;
    if (dailyRate !== undefined) updates.dailyRate = Number(dailyRate);
    if (isActive !== undefined) updates.isActive = isActive;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Provide at least one rate field to update." });
    }

    updates.updatedBy = req.user._id;
    const rate = await DemurrageRate.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    );

    if (!rate) return res.status(404).json({ message: "Demurrage rate not found." });
    return res.status(200).json({ message: "Demurrage rate updated successfully.", rate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A demurrage rate already exists for this container size." });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    console.error("Update demurrage rate error:", error);
    return res.status(500).json({ message: "Unable to update the demurrage rate." });
  }
});

export default router;
