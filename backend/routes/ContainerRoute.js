
import express from "express";

import Container from "../models/Container.js";
import BillOfLading from "../models/BillOfLading.js";
import User from "../models/User.js";
import ClearanceEvent from "../models/ClearanceEvent.js";
import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";
import ReleaseOrder from "../models/ReleaseOrder.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

import createEventNotifications from "../services/NotificationService.js";
import { createAndSendWebhook } from "../services/WebhookService.js";
import { publicTrackingRateLimit } from "../middleware/RateLimitingMiddleware.js";

const router = express.Router();

// Check whether a user is allowed to perform a particular stage transition.
const allowedTransitions = {
  ARRIVED: {
    DOCUMENTS_SUBMITTED: ["IMPORTER", "CLEARING_AGENT"],
  },
  DOCUMENTS_SUBMITTED: {
    CUSTOMS_REVIEW: ["CUSTOMS_OFFICER"],
  },
  CUSTOMS_REVIEW: {
    DOCUMENTS_SUBMITTED: ["CUSTOMS_OFFICER"],
  },
};

// Every document type must exist before the importer submits the container for review.
const requiredDocumentTypes = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
  "CERTIFICATE_OF_ORIGIN",
];

// Validate the container number format and ISO 6346 check digit for public lookups.
function isValidPublicContainerNumber(containerNumber) {
  if (!/^[A-Z]{4}[0-9]{7}$/.test(containerNumber)) {
    return false;
  }

  const letterValues = {
    A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19,
    J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29,
    S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
  };

  let sum = 0;

  for (let index = 0; index < 10; index += 1) {
    const character = containerNumber[index];
    const value = Number.isNaN(Number(character))
      ? letterValues[character]
      : Number(character);
    sum += value * 2 ** index;
  }

  const remainder = sum % 11;
  const checkDigit = remainder === 10 ? 0 : remainder;

  return checkDigit === Number(containerNumber[10]);
}

// Publicly return only clearance progress and a demurrage day estimate.
router.get("/track", publicTrackingRateLimit, async (req, res, next) => {
  try {
    const containerNumber = String(req.query.containerNumber || "")
      .trim()
      .toUpperCase();

    if (!isValidPublicContainerNumber(containerNumber)) {
      return res.status(400).json({
        message: "Please provide a valid container number.",
      });
    }

    const container = await Container.findOne({ containerNumber, status: { $ne: "INACTIVE" } })
      .select("containerNumber currentStage arrivalDate")
      .lean();

    if (!container) {
      return res.status(404).json({
        message: "No container was found with that container number.",
      });
    }

    const events = await ClearanceEvent.find({ container: container._id })
      .select("toStage createdAt")
      .sort({ createdAt: 1 })
      .lean();
    const releaseOrder = await ReleaseOrder.findOne({ container: container._id })
      .select("isRevoked gateCodeUsed")
      .lean();

    const arrivalEvent = events.find((event) => event.toStage === "ARRIVED");
    const collectionEvent = events.find((event) => event.toStage === "COLLECTED");
    const arrivalTime = arrivalEvent?.createdAt || container.arrivalDate;
    const endTime = collectionEvent?.createdAt || new Date();
    const elapsedMilliseconds = Math.max(0, endTime - arrivalTime);
    const elapsedDays = Math.floor(elapsedMilliseconds / (24 * 60 * 60 * 1000));
    const chargeableDays = Math.max(0, elapsedDays - 7);

    return res.status(200).json({
      containerNumber: container.containerNumber,
      currentStage: container.currentStage,
      releaseOrderStatus: releaseOrder
        ? releaseOrder.isRevoked
          ? "REVOKED"
          : releaseOrder.gateCodeUsed
            ? "COLLECTED"
            : "ACTIVE"
        : null,
      completedStages: events.map((event) => ({
        stage: event.toStage,
        completedAt: event.createdAt,
      })),
      demurrage: {
        arrivalAt: arrivalTime,
        collectedAt: collectionEvent?.createdAt || null,
        elapsedDays,
        freeDays: 7,
        chargeableDays,
        dailyRate: null,
        estimatedFee: null,
        feeStatus: "RATE_NOT_CONFIGURED",
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/containers
// Importer or Clearing Agent only.
// Register one container under an existing Bill of Lading.
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

      if (!/^[0-9a-fA-F]{24}$/.test(billOfLading)) {
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
        if (!/^[0-9a-fA-F]{24}$/.test(assignedAgent)) {
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

      let container;
      try {
        container = await Container.create({
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
      } catch (error) {
        // The unique partial index is the final guard against concurrent registrations.
        if (error.code === 11000) {
          const activeContainer = await Container.findOne({
            containerNumber: normalizedContainerNumber,
            status: { $in: ["ACTIVE", "HELD"] },
          });

          return res.status(409).json({
            message: "This container number already has an active clearance.",
            existingContainerId: activeContainer?._id,
          });
        }

        // A network error can happen after MongoDB saved the container.
        try {
          container = await Container.findOne({
            containerNumber: normalizedContainerNumber,
            billOfLading: existingBL._id,
            createdBy: req.user._id,
            status: "ACTIVE",
          });
        } catch (checkError) {
          console.error("Could not verify container registration:", checkError.message);
          throw error;
        }

        if (!container) throw error;

        const existingArrivalEvent = await ClearanceEvent.exists({
          container: container._id,
          toStage: "ARRIVED",
        });
        if (existingArrivalEvent) {
          return res.status(409).json({
            message: "This container number already has an active clearance.",
            existingContainerId: container._id,
          });
        }
      }

      let initialEvent;

      try {
        // Record the first stage so the clearance history starts at registration.
        initialEvent = await ClearanceEvent.create({
          container: container._id,
          fromStage: null,
          toStage: "ARRIVED",
          performedBy: req.user._id,
          reason: "Container registered and arrived for clearance.",
        });
      } catch (eventError) {
        // Verify an uncertain write before removing the container.
        let savedInitialEvent;
        try {
          savedInitialEvent = await ClearanceEvent.findOne({
            container: container._id,
            toStage: "ARRIVED",
          });
        } catch (checkError) {
          // Keep the container if the event result cannot be checked safely.
          console.error("Could not verify initial clearance event:", checkError.message);
          throw eventError;
        }

        if (savedInitialEvent) {
          initialEvent = savedInitialEvent;
        } else {
          // Without transactions, delete the container if its initial event was not saved.
          try {
            await Container.findByIdAndDelete(container._id);
          } catch (rollbackError) {
            console.error("Could not remove container after initial event failure:", rollbackError.message);
          }
          throw eventError;
        }
      }

      // Send the same arrival notice and webhook used for later stage events.
      try {
        await createEventNotifications({
          recipientIds: [container.importer, container.assignedAgent].filter(Boolean),
          containerId: container._id,
          type: "CLEARANCE_STAGE",
          titleEnglish: "Container Arrived",
          titleSomali: "Konteenarku Wuu Yimid",
          messageEnglish: `Container ${container.containerNumber} has been registered at the port.`,
          messageSomali: `Konteenarka ${container.containerNumber} waxaa laga diiwaangeliyay dekedda.`,
          sendSMS: true,
        });
      } catch (notificationError) {
        console.error("Container arrival notification failed:", notificationError.message);
      }

      try {
        await createAndSendWebhook(initialEvent._id);
      } catch (webhookError) {
        console.error("Container arrival webhook failed:", webhookError.message);
      }

      return res.status(201).json({
        message: "Container registered successfully.",
        container,
        clearanceEvent: initialEvent,
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
      .populate("dutyAssessment.assessedBy", "fullName")
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
router.get("/:id", AuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        message: "Invalid container ID.",
      });
    }

    const container = await Container.findById(id)
      .populate("billOfLading", "blNumber shippingLine port")
      .populate("importer", "fullName email phone")
      .populate("assignedAgent", "fullName email phone")
      .populate("createdBy", "fullName email")
      .populate("dutyAssessment.assessedBy", "fullName");

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

// PATCH /api/containers/:id
// Importers may edit their own registrations; Admins may edit any container.
router.patch(
  "/:id",
  AuthMiddleware,
  RoleMiddleware("IMPORTER", "ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const allowedFields = [
        "containerNumber", "billOfLading", "size", "cargoDescription",
        "hsCode", "cifValue", "arrivalDate", "assignedAgent",
      ];
      if (!/^[0-9a-fA-F]{24}$/.test(id)) {
        return res.status(400).json({ message: "Invalid container ID." });
      }
      const unexpectedFields = Object.keys(req.body).filter((key) => !allowedFields.includes(key));
      if (unexpectedFields.length) {
        return res.status(400).json({ message: "One or more fields cannot be changed through this endpoint." });
      }
      if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: "Provide at least one editable container field." });
      }
      const container = await Container.findById(id);
      if (!container) return res.status(404).json({ message: "Container not found." });
      if (req.user.role === "IMPORTER" &&
        (!container.createdBy.equals(req.user._id) || !container.importer.equals(req.user._id))) {
        return res.status(403).json({ message: "You can only edit containers you registered for your own account." });
      }
      if (container.status === "INACTIVE") {
        return res.status(409).json({ message: "An inactive container cannot be edited." });
      }
      if (container.status === "COMPLETED" || container.currentStage === "COLLECTED") {
        return res.status(409).json({ message: "A completed container cannot be edited." });
      }
      const updates = { ...req.body };
      const changesBillOfLading = updates.billOfLading !== undefined &&
        String(updates.billOfLading) !== String(container.billOfLading);
      if (updates.cifValue !== undefined && container.dutyAssessment) {
        return res.status(409).json({ message: "CIF value cannot be changed after duty assessment." });
      }
      if (updates.hsCode !== undefined && container.dutyAssessment) {
        return res.status(409).json({ message: "HS Code cannot be changed after duty assessment." });
      }
      if (updates.billOfLading !== undefined && String(updates.billOfLading) !== String(container.billOfLading)) {
        if (container.currentStage !== "ARRIVED" || await Document.exists({ container: id })) {
          return res.status(409).json({ message: "Bill of Lading cannot be changed after clearance documents or review have begun." });
        }
        if (!/^[0-9a-fA-F]{24}$/.test(updates.billOfLading)) {
          return res.status(400).json({ message: "Invalid Bill of Lading ID." });
        }
        const billOfLading = await BillOfLading.findById(updates.billOfLading);
        if (!billOfLading) return res.status(404).json({ message: "Bill of Lading not found." });
        if (!billOfLading.importer.equals(container.importer)) {
          return res.status(400).json({ message: "The replacement Bill of Lading must belong to the same Importer." });
        }
        if (req.user.role === "IMPORTER" && !billOfLading.importer.equals(req.user._id)) {
          return res.status(403).json({ message: "You can only use your own Bills of Lading." });
        }
      }
      if (updates.containerNumber !== undefined) {
        if (typeof updates.containerNumber !== "string" || !updates.containerNumber.trim()) {
          return res.status(400).json({ message: "Container number is required." });
        }
        updates.containerNumber = updates.containerNumber.trim().toUpperCase();
      }
      if (updates.size !== undefined && !["20FT", "40FT"].includes(updates.size)) {
        return res.status(400).json({ message: "Container size must be 20FT or 40FT." });
      }
      for (const field of ["cargoDescription", "hsCode"]) {
        if (updates[field] !== undefined) {
          if (typeof updates[field] !== "string" || !updates[field].trim()) {
            return res.status(400).json({ message: `${field === "hsCode" ? "HS Code" : "Cargo description"} is required.` });
          }
          updates[field] = updates[field].trim();
        }
      }
      if (updates.cifValue !== undefined && (!Number.isFinite(Number(updates.cifValue)) || Number(updates.cifValue) <= 0)) {
        return res.status(400).json({ message: "CIF value must be a number greater than zero." });
      }
      if (updates.arrivalDate !== undefined) {
        if (updates.arrivalDate === null || updates.arrivalDate === "") {
          return res.status(400).json({ message: "Arrival date is required." });
        }
        const parsedDate = new Date(updates.arrivalDate);
        if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ message: "Invalid arrival date." });
        updates.arrivalDate = parsedDate;
      }
      if (updates.assignedAgent !== undefined && updates.assignedAgent !== null && updates.assignedAgent !== "") {
        if (!/^[0-9a-fA-F]{24}$/.test(String(updates.assignedAgent))) {
          return res.status(400).json({ message: "Invalid Clearing Agent ID." });
        }
        const agent = await User.findOne({ _id: updates.assignedAgent, role: "CLEARING_AGENT", isActive: true }).select("_id");
        if (!agent) return res.status(400).json({ message: "Selected Clearing Agent does not exist or is inactive." });
        updates.assignedAgent = agent._id;
      } else if (updates.assignedAgent !== undefined) {
        updates.assignedAgent = null;
      }

      const updateFilter = {
        _id: id,
        status: { $nin: ["INACTIVE", "COMPLETED"] },
        currentStage: { $ne: "COLLECTED" },
      };
      if (updates.cifValue !== undefined || updates.hsCode !== undefined) {
        updateFilter.dutyAssessment = { $exists: false };
      }
      if (changesBillOfLading) {
        updateFilter.currentStage = "ARRIVED";
        updateFilter.documentUploadReservations = {
          $not: { $elemMatch: { expiresAt: { $gt: new Date() } } },
        };
      }
      const updatedContainer = await Container.findOneAndUpdate(
        updateFilter,
        { $set: updates },
        { returnDocument: "after", runValidators: true },
      );
      if (!updatedContainer) return res.status(409).json({ message: "Container status changed. Refresh before editing." });
      return res.status(200).json({ message: "Container updated successfully.", container: updatedContainer });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: "This container number already has an active clearance." });
      if (error.name === "ValidationError") return res.status(400).json({ message: error.message });
      next(error);
    }
  },
);

// PATCH /api/containers/:id/deactivate
// Admin only. Marks the container inactive while preserving its history and stage.
router.patch(
  "/:id/deactivate",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return res.status(400).json({ message: "Invalid container ID." });
      const container = await Container.findOneAndUpdate(
        {
          _id: id,
          status: { $ne: "INACTIVE" },
          documentUploadReservations: {
            $not: { $elemMatch: { expiresAt: { $gt: new Date() } } },
          },
        },
        { $set: { status: "INACTIVE" } },
        { returnDocument: "after", runValidators: true },
      );
      if (!container) {
        const existing = await Container.findById(id).select("_id status");
        if (!existing) return res.status(404).json({ message: "Container not found." });
        const activeUpload = await Container.exists({
          _id: id,
          documentUploadReservations: { $elemMatch: { expiresAt: { $gt: new Date() } } },
        });
        if (activeUpload) return res.status(409).json({ message: "Wait for the active document upload to finish before deactivating this container." });
        return res.status(409).json({ message: "Container is already inactive." });
      }
      return res.status(200).json({ message: "Container deactivated successfully.", container });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/containers/:id/stage
// Importer, Clearing Agent, or Customs Officer depending on the transition.
// Accepts toStage and an optional reason for the permitted backward transition.
router.patch("/:id/stage", AuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { toStage, reason } = req.body;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        message: "Invalid container ID.",
      });
    }

    if (!toStage || typeof toStage !== "string") {
      return res.status(400).json({
        message: "The destination stage is required.",
      });
    }

    const container = await Container.findById(id);

    if (!container) {
      return res.status(404).json({
        message: "Container not found.",
      });
    }

    if (container.status === "INACTIVE") {
      return res.status(409).json({ message: "An inactive container cannot advance through clearance." });
    }

    // Importers can only transition their own containers.
    if (
      req.user.role === "IMPORTER" &&
      !container.importer.equals(req.user._id)
    ) {
      return res.status(403).json({
        message: "You can only update your own containers.",
      });
    }

    // Agents can only transition containers assigned to them.
    if (
      req.user.role === "CLEARING_AGENT" &&
      (!container.assignedAgent ||
        !container.assignedAgent.equals(req.user._id))
    ) {
      return res.status(403).json({
        message: "This container is not assigned to you.",
      });
    }

    const fromStage = container.currentStage;

    // Duty assessment also saves the exact rate snapshot, so it has its own endpoint.
    if (fromStage === "CUSTOMS_REVIEW" && toStage === "DUTY_ASSESSED") {
      return res.status(400).json({
        message: "Use POST /api/payments/:containerId/assess to verify documents and save the duty assessment.",
      });
    }

    const allowedRoles = allowedTransitions[fromStage]?.[toStage];

    // Reject transitions that are not part of the clearance workflow.
    if (!allowedRoles) {
      return res.status(400).json({
        message: `Transition from ${fromStage} to ${toStage} is not allowed.`,
      });
    }

    // Check whether the user's role can perform this transition.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Your role is not allowed to perform this stage transition.",
      });
    }

    // The backward transition requires a written explanation.
    if (
      fromStage === "CUSTOMS_REVIEW" &&
      toStage === "DOCUMENTS_SUBMITTED" &&
      (!reason ||
        typeof reason !== "string" ||
        reason.trim().length < 10)
    ) {
      return res.status(400).json({
        message: "The reason must contain at least 10 characters.",
      });
    }

    // Submission requires a saved latest version; Customs approval is checked during assessment.
    if (fromStage === "ARRIVED" && toStage === "DOCUMENTS_SUBMITTED") {
      const documents = await Document.find({
        container: container._id,
        documentType: { $in: requiredDocumentTypes },
      });
      const incompleteDocumentTypes = [];

      for (const documentType of requiredDocumentTypes) {
        const document = documents.find(
          (item) => item.documentType === documentType,
        );

        if (!document) {
          incompleteDocumentTypes.push(documentType);
          continue;
        }

        if (
          !Number.isInteger(document.latestVersion) ||
          document.latestVersion < 1
        ) {
          incompleteDocumentTypes.push(documentType);
          continue;
        }

        // The document is scoped to this container and the version must point back to it.
        const latestVersion = await DocumentVersion.findOne({
          document: document._id,
        })
          .sort({ versionNumber: -1 })
          .select("document versionNumber");

        if (
          !latestVersion ||
          !latestVersion.document.equals(document._id) ||
          latestVersion.versionNumber !== document.latestVersion
        ) {
          incompleteDocumentTypes.push(documentType);
        }
      }

      if (incompleteDocumentTypes.length > 0) {
        return res.status(400).json({
          message: "All required documents must have a saved latest version before submission.",
          incompleteDocumentTypes,
        });
      }
    }

    // Update only if the stage has not changed since it was retrieved.
    const stageUpdateFilter = {
      _id: id,
      currentStage: fromStage,
      status: { $in: ["ACTIVE", "HELD"] },
    };

    // Do not begin Customs review while a valid upload is still being processed.
    if (toStage === "CUSTOMS_REVIEW") {
      stageUpdateFilter.documentUploadReservations = {
        $not: {
          $elemMatch: {
            expiresAt: { $gt: new Date() },
          },
        },
      };
    }

    const updatedContainer = await Container.findOneAndUpdate(
      stageUpdateFilter,
      {
        $set: {
          currentStage: toStage,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!updatedContainer) {
      return res.status(409).json({
        message: "Stage already changed, please refresh.",
      });
    }

    let clearanceEvent;

    try {
      // Record the successful stage transition.
      clearanceEvent = await ClearanceEvent.create({
        container: container._id,
        fromStage,
        toStage,
        performedBy: req.user._id,
        reason:
          reason?.trim() ||
          `Container moved from ${fromStage} to ${toStage}.`,
      });
    } catch (eventError) {
      // Restore the previous stage if the event could not be recorded.
      await Container.findOneAndUpdate(
        {
          _id: container._id,
          currentStage: toStage,
        },
        {
          $set: {
            currentStage: fromStage,
          },
        },
      );

      throw eventError;
    }

    // Notify the importer and assigned agent about the stage change.
    try {
      await createEventNotifications({
        recipientIds: [
          container.importer,
          container.assignedAgent,
        ].filter(Boolean),

        containerId: container._id,
        type: "CLEARANCE_STAGE",

        titleEnglish: "Clearance Stage Updated",
        titleSomali: "Marxaladda Fasaxa Waa La Cusboonaysiiyay",

        messageEnglish: `Container ${container.containerNumber} moved from ${fromStage} to ${toStage}.`,
        messageSomali: `Konteenarka ${container.containerNumber} wuxuu ka gudbay ${fromStage} wuxuuna u gudbay ${toStage}.`,

        sendSMS: true,
      });
    } catch (notificationError) {
      // Notification failure must not undo a successful stage transition.
      console.error(
        "Clearance notification failed:",
        notificationError.message,
      );
    }

    // Send the clearance event to the Shipping Line webhook.
    try {
      await createAndSendWebhook(clearanceEvent._id);
    } catch (webhookError) {
      // Webhook failure must not undo a successful stage transition.
      console.error(
        "Clearance webhook failed:",
        webhookError.message,
      );
    }

    return res.status(200).json({
      message: "Container stage updated successfully.",
      container: updatedContainer,
      clearanceEvent,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/containers/:id/assign-agent
// Importer only.
// Accepts assignedAgent (an active Clearing Agent's ID).
router.patch(
  "/:id/assign-agent",
  AuthMiddleware,
  RoleMiddleware("IMPORTER"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { assignedAgent } = req.body;

      if (!/^[0-9a-fA-F]{24}$/.test(id)) {
        return res.status(400).json({
          message: "Invalid container ID.",
        });
      }

      if (!assignedAgent) {
        return res.status(400).json({
          message: "Clearing Agent ID is required.",
        });
      }

      if (!/^[0-9a-fA-F]{24}$/.test(assignedAgent)) {
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

      if (container.status === "INACTIVE") {
        return res.status(409).json({ message: "An inactive container cannot be reassigned." });
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

      const updatedContainer = await Container.findOneAndUpdate(
        { _id: container._id, importer: req.user._id, status: { $ne: "INACTIVE" }, currentStage: { $ne: "COLLECTED" } },
        { $set: { assignedAgent: agent._id } },
        { returnDocument: "after", runValidators: true },
      );
      if (!updatedContainer) return res.status(409).json({ message: "Container status changed. Refresh before assigning an Agent." });

      return res.status(200).json({
        message: "Clearing Agent assigned successfully.",
        container: updatedContainer,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
