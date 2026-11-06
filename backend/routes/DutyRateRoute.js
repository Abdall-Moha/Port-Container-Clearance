
import express from "express";

import DutyRate from "../models/DutyRate.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

/*
  POST /api/duty-rates

  Admin creates a duty rate for an HS Chapter.
*/
router.post(
  "/",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res) => {
    try {
      const {
        hsChapter,
        dutyPercentage,
        portFee20FT,
        portFee40FT,
      } = req.body;

      // Check that all required values were provided.
      if (
        hsChapter === undefined ||
        dutyPercentage === undefined ||
        portFee20FT === undefined ||
        portFee40FT === undefined
      ) {
        return res.status(400).json({
          message: "Please provide HS Chapter, duty percentage, and both container fees.",
        });
      }

      // Check whether this HS Chapter already has a rate.
      const existingRate = await DutyRate.findOne({
        hsChapter: String(hsChapter).trim(),
      });

      if (existingRate) {
        return res.status(409).json({
          message: "A duty rate already exists for this HS Chapter.",
        });
      }

      // Create the new duty rate.
      const dutyRate = await DutyRate.create({
        hsChapter,
        dutyPercentage,
        portFee20FT,
        portFee40FT,
        createdBy: req.user._id,
      });

      return res.status(201).json({
        message: "Duty rate created successfully.",
        dutyRate,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "A duty rate already exists for this HS Chapter.",
        });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({
          message: error.message,
        });
      }

      console.error("Create duty rate error:", error);

      return res.status(500).json({
        message: "An error occurred while creating the duty rate.",
      });
    }
  },
);

/*
  GET /api/duty-rates

  Get all duty rates.
  Admins can see active and inactive rates.
  Other authenticated users can only see active rates.

  Optional query:
  ?hsChapter=85
*/
router.get(
  "/",
  AuthMiddleware,
  async (req, res) => {
    try {
      const filter = {};

      // Hide inactive rates from non-Admin users.
      if (req.user.role !== "ADMIN") {
        filter.isActive = true;
      }

      // Filter by HS Chapter when provided.
      if (req.query.hsChapter !== undefined) {
        const hsChapter = String(req.query.hsChapter).trim();

        if (!/^\d{2}$/.test(hsChapter)) {
          return res.status(400).json({
            message: "HS Chapter must contain exactly two digits.",
          });
        }

        filter.hsChapter = hsChapter;
      }

      const dutyRates = await DutyRate.find(filter)
        .sort({ hsChapter: 1 })
        .populate("createdBy", "fullName email")
        .populate("updatedBy", "fullName email");

      return res.status(200).json({
        totalRates: dutyRates.length,
        dutyRates,
      });
    } catch (error) {
      console.error("Get duty rates error:", error);

      return res.status(500).json({
        message: "An error occurred while retrieving duty rates.",
      });
    }
  },
);

/*
  GET /api/duty-rates/chapter/:hsChapter

  Get the duty rate for one HS Chapter.
  Only active rates are available to non-Admin users.
*/
router.get(
  "/chapter/:hsChapter",
  AuthMiddleware,
  async (req, res) => {
    try {
      const hsChapter = String(req.params.hsChapter).trim();

      // Validate the HS Chapter.
      if (!/^\d{2}$/.test(hsChapter)) {
        return res.status(400).json({
          message: "HS Chapter must contain exactly two digits.",
        });
      }

      const filter = {
        hsChapter,
      };

      // Non-Admins cannot use inactive rates.
      if (req.user.role !== "ADMIN") {
        filter.isActive = true;
      }

      const dutyRate = await DutyRate.findOne(filter)
        .populate("createdBy", "fullName email")
        .populate("updatedBy", "fullName email");

      if (!dutyRate) {
        return res.status(404).json({
          message: "Rate missing, contact Admin.",
        });
      }

      return res.status(200).json({
        dutyRate,
      });
    } catch (error) {
      console.error("Get duty rate by chapter error:", error);

      return res.status(500).json({
        message: "An error occurred while retrieving the duty rate.",
      });
    }
  },
);

/*
  PATCH /api/duty-rates/:id

  Admin updates an existing duty rate.
  The Admin can also deactivate or reactivate a rate.
*/
router.patch(
  "/:id",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res) => {
    try {
      const {
        hsChapter,
        dutyPercentage,
        portFee20FT,
        portFee40FT,
        isActive,
      } = req.body;

      // Find the existing duty rate.
      const dutyRate = await DutyRate.findById(
        req.params.id,
      );

      if (!dutyRate) {
        return res.status(404).json({
          message: "Duty rate not found.",
        });
      }

      // Update only the fields provided by the Admin.
      if (hsChapter !== undefined) {
        dutyRate.hsChapter = hsChapter;
      }

      if (dutyPercentage !== undefined) {
        dutyRate.dutyPercentage = dutyPercentage;
      }

      if (portFee20FT !== undefined) {
        dutyRate.portFee20FT = portFee20FT;
      }

      if (portFee40FT !== undefined) {
        dutyRate.portFee40FT = portFee40FT;
      }

      if (isActive !== undefined) {
        dutyRate.isActive = isActive;
      }

      // Record which Admin updated the rate.
      dutyRate.updatedBy = req.user._id;

      await dutyRate.save();

      return res.status(200).json({
        message: "Duty rate updated successfully.",
        dutyRate,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "A duty rate already exists for this HS Chapter.",
        });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({
          message: error.message,
        });
      }

      console.error("Update duty rate error:", error);

      return res.status(500).json({
        message: "An error occurred while updating the duty rate.",
      });
    }
  },
);

export default router;
