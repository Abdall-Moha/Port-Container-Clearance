
import express from "express";

import Container from "../models/Container.js";
import BillOfLading from "../models/BillOfLading.js";
import User from "../models/User.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

// POST /api/containers
// Importer or Clearing Agent only.
// Accepts billOfLading, containerNumber, size, cargoDescription,
// hsCode, cifValue, arrivalDate, and optionally assignedAgent.
// Registers one container under an existing Bill of Lading.
router.post(
  "/",
  AuthMiddleware,
  RoleMiddleware("IMPORTER", "CLEARING_AGENT"),
  async (req, res, next) => {
    try {
      const {
        billOfLading,
        containerNumber,
        size,
        cargoDescription,
        hsCode,
        cifValue,
        arrivalDate,
        assignedAgent,
      } = req.body;

      if (
        !billOfLading ||
        !containerNumber ||
        !size ||
        !cargoDescription ||
        !hsCode ||
        cifValue === undefined ||
        !arrivalDate
      ) {
        return res.status(400).json({
          message: "Please provide all required container information.",
        });
      }

      if (!billOfLading.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid Bill of Lading ID.",
        });
      }

      // Find the existing BL and verify the user's permission.
      const existingBL = await BillOfLading.findById(billOfLading);

      if (!existingBL) {
        return res.status(404).json({
          message: "Bill of Lading not found.",
        });
      }

      if (
        req.user.role === "IMPORTER" &&
        !existingBL.importer.equals(req.user._id)
      ) {
        return res.status(403).json({
          message: "You can only register containers under your own BLs.",
        });
      }

      if (
        req.user.role === "CLEARING_AGENT" &&
        !existingBL.createdBy.equals(req.user._id)
      ) {
        return res.status(403).json({
          message: "You can only register containers under BLs you created.",
        });
      }

      // Validate container size.
      if (!["20FT", "40FT"].includes(size)) {
        return res.status(400).json({
          message: "Container size must be 20FT or 40FT.",
        });
      }

      // CIF must be a valid positive number.
      if (!Number.isFinite(Number(cifValue)) || Number(cifValue) <= 0) {
        return res.status(400).json({
          message: "CIF value must be a number greater than zero.",
        });
      }

      // Arrival date must be valid.
      const parsedArrivalDate = new Date(arrivalDate);

      if (isNaN(parsedArrivalDate.getTime())) {
        return res.status(400).json({
          message: "Invalid arrival date.",
        });
      }

      // Prevent duplicate active containers.
      const normalizedContainerNumber =
        containerNumber.trim().toUpperCase();

      const existingContainer = await Container.findOne({
        containerNumber: normalizedContainerNumber,
        status: { $in: ["ACTIVE", "HELD"] },
      });

      if (existingContainer) {
        return res.status(409).json({
          message: "This container number already has an active clearance.",
          existingContainerId: existingContainer._id,
        });
      }

      // If an Agent is provided, make sure it is an active Agent.
      let agentId = null;

      if (assignedAgent) {
        if (!assignedAgent.match(/^[0-9a-fA-F]{24}$/)) {
          return res.status(400).json({
            message: "Invalid Clearing Agent ID.",
          });
        }

        const agent = await User.findOne({
          _id: assignedAgent,
          role: "CLEARING_AGENT",
          isActive: true,
        });

        if (!agent) {
          return res.status(400).json({
            message: "Selected Clearing Agent does not exist or is inactive.",
          });
        }

        agentId = agent._id;
      }

      const container = await Container.create({
        containerNumber: normalizedContainerNumber,
        billOfLading: existingBL._id,
        importer: existingBL.importer,
        assignedAgent: agentId,
        size,
        cargoDescription: cargoDescription.trim(),
        hsCode: hsCode.trim(),
        cifValue: Number(cifValue),
        arrivalDate: parsedArrivalDate,
        currentStage: "ARRIVED",
        status: "ACTIVE",
        createdBy: req.user._id,
      });

      return res.status(201).json({
        message: "Container registered successfully.",
        container,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/containers
// Authenticated users.
// Importers see their containers.
// Clearing Agents see containers assigned to them.
// Admins and Customs Officers can view all containers.
// Supports optional ?stage=ARRIVED filtering.
router.get("/", AuthMiddleware, async (req, res, next) => {
  try {
    const { stage } = req.query;

    const allowedStages = [
      "ARRIVED",
      "DOCUMENTS_SUBMITTED",
      "CUSTOMS_REVIEW",
      "DUTY_ASSESSED",
      "DUTY_PAID",
      "INSPECTION",
      "RELEASED",
      "COLLECTED",
    ];

    if (stage && !allowedStages.includes(stage)) {
      return res.status(400).json({
        message: "Invalid clearance stage.",
      });
    }

    const filter = {};

    if (stage) {
      filter.currentStage = stage;
    }

    // Importers can only view their own containers.
    if (req.user.role === "IMPORTER") {
      filter.importer = req.user._id;
    }

    // Agents can only view containers assigned to them.
    if (req.user.role === "CLEARING_AGENT") {
      filter.assignedAgent = req.user._id;
    }

    const containers = await Container.find(filter)
      .populate("billOfLading", "blNumber shippingLine port")
      .populate("importer", "fullName email phone")
      .populate("assignedAgent", "fullName email phone")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: containers.length,
      containers,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/containers/:id
// Authenticated users.
// Returns one container and its related BL, Importer, and Agent.
// Importers see their own containers; Agents see assigned containers.
router.get("/:id", AuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: "Invalid container ID.",
      });
    }

    const container = await Container.findById(id)
      .populate("billOfLading", "blNumber shippingLine port")
      .populate("importer", "fullName email phone")
      .populate("assignedAgent", "fullName email phone")
      .populate("createdBy", "fullName email");

    if (!container) {
      return res.status(404).json({
        message: "Container not found.",
      });
    }

    if (
      req.user.role === "IMPORTER" &&
      !container.importer._id.equals(req.user._id)
    ) {
      return res.status(403).json({
        message: "You do not have permission to view this container.",
      });
    }

    if (
      req.user.role === "CLEARING_AGENT" &&
      (!container.assignedAgent ||
        !container.assignedAgent._id.equals(req.user._id))
    ) {
      return res.status(403).json({
        message: "This container is not assigned to you.",
      });
    }

    return res.status(200).json({ container });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/containers/:id/assign-agent
// Importer only.
// Accepts assignedAgent (an active Clearing Agent's ID).
// Assigns or changes the Clearing Agent responsible for this container.
router.patch(
  "/:id/assign-agent",
  AuthMiddleware,
  RoleMiddleware("IMPORTER"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { assignedAgent } = req.body;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid container ID.",
        });
      }

      if (!assignedAgent) {
        return res.status(400).json({
          message: "Clearing Agent ID is required.",
        });
      }

      if (!assignedAgent.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          message: "Invalid Clearing Agent ID.",
        });
      }

      const container = await Container.findById(id);

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      // Importers may only assign Agents to their own containers.
      if (!container.importer.equals(req.user._id)) {
        return res.status(403).json({
          message: "You can only assign Agents to your own containers.",
        });
      }

      if (container.currentStage === "COLLECTED") {
        return res.status(400).json({
          message: "A collected container cannot be reassigned.",
        });
      }

      const agent = await User.findOne({
        _id: assignedAgent,
        role: "CLEARING_AGENT",
        isActive: true,
      });

      if (!agent) {
        return res.status(400).json({
          message: "Selected Clearing Agent does not exist or is inactive.",
        });
      }

      container.assignedAgent = agent._id;
      await container.save();

      return res.status(200).json({
        message: "Clearing Agent assigned successfully.",
        container,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
