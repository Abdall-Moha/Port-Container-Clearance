import express from "express";
import { randomInt } from "crypto";
import fs from "fs/promises";

import ReleaseOrder from "../models/ReleaseOrder.js";
import Container from "../models/Container.js";
import Payment from "../models/Payment.js";
import Inspection from "../models/Inspection.js";
import ClearanceEvent from "../models/ClearanceEvent.js";
import createEventNotifications from "../services/NotificationService.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

import { createAndSendWebhook } from "../services/WebhookService.js";

import {
  generateReleaseOrderPDF,
  getReleaseOrderPDFPath,
} from "../services/ReleaseOrderPDFService.js";

const router = express.Router();

// Check whether the logged-in user can access a container.
function canAccessContainer(user, container) {
  if (!user || !container) return false;

  // Admins and Customs Officers can access all containers.
  if (
    user.role === "ADMIN" ||
    user.role === "CUSTOMS_OFFICER"
  ) {
    return true;
  }

  // Importers can access their own containers.
  if (
    user.role === "IMPORTER" &&
    String(container.importer) === String(user._id)
  ) {
    return true;
  }

  // Clearing Agents can access containers assigned to them.
  if (
    user.role === "CLEARING_AGENT" &&
    String(container.assignedAgent) === String(user._id)
  ) {
    return true;
  }

  return false;
}

// Generate a random six-digit Gate Code.
function generateGateCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

// Hide internal file paths and keep Gate Codes out of Importer JSON responses.
function sanitizeReleaseOrder(releaseOrder, role) {
  const data = releaseOrder.toObject ? releaseOrder.toObject() : { ...releaseOrder };
  delete data.pdfPath;
  if (role === "IMPORTER") delete data.gateCode;
  return data;
}

/*
  POST /api/release-orders/:containerId/create

  Customs Officer creates a release order.

  Requirements:
  - Container must have passed its latest inspection at INSPECTION stage.
  - Container must have a successful payment.

  This endpoint also generates the PDF and QR code.
*/
router.post(
  "/:containerId/create",
  AuthMiddleware,
  RoleMiddleware("CUSTOMS_OFFICER"),
  async (req, res) => {
    try {
      // Find the container.
      const container = await Container.findById(
        req.params.containerId,
      );

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      if (container.status === "INACTIVE") {
        return res.status(409).json({ message: "A release order cannot be created for an inactive container." });
      }

      // Only a container still at INSPECTION may be advanced by this operation.
      if (container.currentStage !== "INSPECTION") {
        return res.status(409).json({
          message:
            "A release order can only be created for a container that has not yet been released.",
          currentStage: container.currentStage,
        });
      }

      if (container.status !== "ACTIVE") {
        return res.status(409).json({
          message: "A held or inactive container cannot be released.",
          status: container.status,
        });
      }

      // Check that the container has a successful payment.
      const successfulPayment = await Payment.findOne({
        container: container._id,
        status: "SUCCESS",
      });

      if (!successfulPayment) {
        return res.status(409).json({
          message:
            "A successful payment is required before creating a release order.",
        });
      }

      // Check that the container passed its latest inspection.
      const latestInspection = await Inspection.findOne({
        container: container._id,
      }).sort({ inspectionNumber: -1 });

      if (!latestInspection || latestInspection.result !== "PASS") {
        return res.status(409).json({
          message:
            "The container must pass inspection before a release order can be created.",
        });
      }

      // Prevent creating multiple release orders for the same container.
      const existingOrder = await ReleaseOrder.findOne({
        container: container._id,
      });

      if (existingOrder) {
        return res.status(409).json({
          message:
            "A release order already exists for this container.",
          releaseOrder: existingOrder,
        });
      }

      // Generate a unique six-digit Gate Code.
      let gateCode = generateGateCode();

      while (await ReleaseOrder.exists({ gateCode })) {
        gateCode = generateGateCode();
      }

      // Create the release order.
      const releaseOrder = await ReleaseOrder.create({
        container: container._id,
        releasedBy: req.user._id,
        gateCode,
      });

      let generatedPdfPath = "";
      let movedToReleased = false;
      let releaseEvent = null;

      try {
        // Retrieve the release order with its related information.
        const populatedOrder = await ReleaseOrder.findById(
          releaseOrder._id,
        )
          .populate("releasedBy", "fullName email")
          .populate({
            path: "container",
            populate: [
              {
                path: "billOfLading",
              },
              {
                path: "importer",
                select: "fullName email",
              },
            ],
          });

        // Generate the PDF and QR code using the separate services.
        const pdfPath = await generateReleaseOrderPDF({
          releaseOrder: populatedOrder,
          container: populatedOrder.container,
          payment: successfulPayment,
        });
        generatedPdfPath = pdfPath;

        // Save the generated PDF location.
        populatedOrder.pdfPath = pdfPath;

        await populatedOrder.save();

        // Move to RELEASED only after the passing inspection and order are ready.
        const releasedContainer = await Container.findOneAndUpdate(
          {
            _id: container._id,
            currentStage: "INSPECTION",
            status: "ACTIVE",
          },
          { $set: { currentStage: "RELEASED" } },
          { returnDocument: "after" },
        );

        if (!releasedContainer) {
          throw new Error("Container stage changed before release could be completed.");
        }
        movedToReleased = true;

        // Record the new stage transition for history and webhook consumers.
        releaseEvent = await ClearanceEvent.create({
          container: container._id,
          fromStage: "INSPECTION",
          toStage: "RELEASED",
          performedBy: req.user._id,
          reason: "Release Order created after the latest inspection passed.",
        });

        try {
          await createAndSendWebhook(releaseEvent._id);
        } catch (webhookError) {
          console.error("Release stage webhook failed:", webhookError);
        }

        // Return the final stage instead of the pre-release populated snapshot.
        populatedOrder.container.currentStage = "RELEASED";

        // Notify the importer and assigned agent that the release order is ready.
        try {
          await createEventNotifications({
            recipientIds: [container.importer, container.assignedAgent].filter(Boolean),
            containerId: container._id,
            type: "RELEASE_ORDER",
            titleEnglish: "Release Order Created",
            titleSomali: "Amarka Sii-daynta Waa La Sameeyay",
            messageEnglish: `A release order has been created for container ${container.containerNumber}. The container is ready for collection by its assigned Clearing Agent.`,
            messageSomali: `Amar sii-dayn ayaa loo sameeyay konteenarka ${container.containerNumber}. Konteenarka waxaa qaadi kara Wakiilka Kastamka ee loo xilsaaray.`,
            sendSMS: true,
          });
        } catch (notificationError) {
          // Notification failure must not undo the generated release order.
          console.error("Release order notification failed:", notificationError);
        }

        return res.status(201).json({
          message:
            "Release order, PDF, and QR code created successfully.",
          releaseOrder: sanitizeReleaseOrder(populatedOrder, req.user.role),
        });
      } catch (generationError) {
        // Undo a partial release if order generation or its stage event failed.
        if (movedToReleased) {
          await Container.findOneAndUpdate(
            { _id: container._id, currentStage: "RELEASED" },
            { $set: { currentStage: "INSPECTION" } },
          );
          if (releaseEvent) {
            await ClearanceEvent.findByIdAndDelete(releaseEvent._id);
          }
        }

        // Do not leave a release order without its required PDF.
        if (generatedPdfPath) {
          try {
            await fs.unlink(getReleaseOrderPDFPath(generatedPdfPath));
          } catch (fileError) {
            if (fileError.code !== "ENOENT") console.error("Release PDF cleanup failed:", fileError);
          }
        }
        await ReleaseOrder.findByIdAndDelete(releaseOrder._id);

        throw generationError;
      }
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A release order or Gate Code already exists.",
        });
      }

      console.error("Create release order error:", error);

      return res.status(500).json({
        message:
          "An error occurred while creating the release order.",
      });
    }
  },
);

/*
  GET /api/release-orders

  Return release orders connected to containers the signed-in user may access.
  Importers see only their containers, Clearing Agents see assigned containers,
  and Admins or Customs Officers see the full operational list.
*/
router.get(
  "/",
  AuthMiddleware,
  RoleMiddleware("ADMIN", "CUSTOMS_OFFICER", "IMPORTER", "CLEARING_AGENT"),
  async (req, res) => {
  try {
    const containerFilter = {};
    if (req.user.role === "IMPORTER") containerFilter.importer = req.user._id;
    if (req.user.role === "CLEARING_AGENT") containerFilter.assignedAgent = req.user._id;

    const accessibleContainers = await Container.find(containerFilter).select("_id").lean();
    const releaseOrders = await ReleaseOrder.find({
      container: { $in: accessibleContainers.map((container) => container._id) },
    })
      .sort({ createdAt: -1 })
      .populate("releasedBy", "fullName")
      .populate("revokedBy", "fullName")
      .populate("collectedBy", "fullName")
      .populate({
        path: "container",
        select: "containerNumber billOfLading importer assignedAgent size currentStage status",
        populate: [
          { path: "billOfLading", select: "blNumber port" },
          { path: "importer", select: "fullName" },
        ],
      });

    return res.status(200).json({
      count: releaseOrders.length,
      releaseOrders: releaseOrders.map((order) => sanitizeReleaseOrder(order, req.user.role)),
    });
  } catch (error) {
    console.error("List release orders error:", error);
    return res.status(500).json({ message: "An error occurred while retrieving release orders." });
  }
  },
);

/*
  PATCH /api/release-orders/:id/collect

  Assigned Clearing Agent marks the container as collected.

  Expected body:
  {
    "gateCode": "123456"
  }
*/
router.patch(
  "/:id/collect",
  AuthMiddleware,
  RoleMiddleware("CLEARING_AGENT"),
  async (req, res) => {
    try {
      const { gateCode } = req.body;

      // Validate the six-digit Gate Code.
      if (!/^\d{6}$/.test(gateCode || "")) {
        return res.status(400).json({
          message:
            "Please provide a valid six-digit Gate Code.",
        });
      }

      // Find the release order.
      let releaseOrder = await ReleaseOrder.findById(
        req.params.id,
      );

      if (!releaseOrder) {
        return res.status(404).json({
          message: "Release order not found.",
        });
      }

      // Find the container connected to this release order.
      const container = await Container.findById(
        releaseOrder.container,
      );

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      if (container.status === "INACTIVE") {
        return res.status(409).json({ message: "An inactive container cannot be collected." });
      }

      // Only the assigned Clearing Agent can collect this container.
      if (
        String(container.assignedAgent) !== String(req.user._id)
      ) {
        return res.status(403).json({
          message:
            "Only the assigned Clearing Agent can collect this container.",
        });
      }

      // A revoked release order cannot be used.
      if (releaseOrder.isRevoked) {
        return res.status(403).json({
          message: "This release order has been revoked.",
        });
      }

      // Do not allow the Gate Code to be used more than once.
      if (releaseOrder.gateCodeUsed) {
        return res.status(409).json({
          message: "This Gate Code has already been used.",
        });
      }

      // Check whether the submitted Gate Code matches.
      if (releaseOrder.gateCode !== gateCode) {
        return res.status(400).json({
          message: "Incorrect Gate Code.",
        });
      }

      // The container must still be waiting for collection.
      if (container.currentStage !== "RELEASED") {
        return res.status(409).json({
          message:
            "This container is not waiting for collection.",
          currentStage: container.currentStage,
        });
      }

      // Claim the Gate Code atomically so revocation and duplicate collection cannot race.
      const claimedReleaseOrder = await ReleaseOrder.findOneAndUpdate(
        {
          _id: releaseOrder._id,
          gateCode,
          isRevoked: false,
          gateCodeUsed: false,
        },
        {
          $set: {
            gateCodeUsed: true,
            collectedBy: req.user._id,
            collectedAt: new Date(),
          },
        },
        { returnDocument: "after", runValidators: true },
      );

      if (!claimedReleaseOrder) {
        return res.status(409).json({
          message: "This release order was revoked or already collected. Please refresh.",
        });
      }

      releaseOrder = claimedReleaseOrder;

      // Update the container only if it is still in RELEASED stage.
      const updatedContainer = await Container.findOneAndUpdate(
        {
          _id: container._id,
          currentStage: "RELEASED",
          status: "ACTIVE",
        },
        {
          $set: {
            currentStage: "COLLECTED",
            status: "COMPLETED",
          },
        },
        {
          returnDocument: "after",
        },
      );

      if (!updatedContainer) {
        await ReleaseOrder.findOneAndUpdate(
          { _id: releaseOrder._id, gateCodeUsed: true, collectedBy: req.user._id },
          { $set: { gateCodeUsed: false, collectedBy: null, collectedAt: null } },
        );
        return res.status(409).json({
          message:
            "Container stage already changed. Please refresh.",
        });
      }

      // Record the final stage transition after both collection records are saved.
      let clearanceEvent;

      try {
        clearanceEvent = await ClearanceEvent.create({
          container: container._id,
          fromStage: "RELEASED",
          toStage: "COLLECTED",
          performedBy: req.user._id,
          reason:
            "Container collected using the release order Gate Code.",
        });
      } catch (saveError) {
        // Restore the release order and container if collection cannot be fully recorded.
        await ReleaseOrder.findOneAndUpdate(
          { _id: releaseOrder._id, gateCodeUsed: true, collectedBy: req.user._id },
          { $set: { gateCodeUsed: false, collectedBy: null, collectedAt: null } },
        );

        await Container.findOneAndUpdate(
          {
            _id: container._id,
            currentStage: "COLLECTED",
          },
          {
            $set: {
              currentStage: "RELEASED",
              status: "ACTIVE",
            },
          },
        );

        throw saveError;
      }

      // Send the webhook after successfully recording the stage transition.
      // A webhook failure must not undo a successful container collection.
      try {
        await createAndSendWebhook(clearanceEvent._id);
      } catch (webhookError) {
        console.error(
          "Collection webhook error:",
          webhookError,
        );
      }

      // Notify the importer and assigned agent that collection is complete.
      try {
        await createEventNotifications({
          recipientIds: [container.importer, container.assignedAgent].filter(Boolean),
          containerId: container._id,
          type: "RELEASE_ORDER",
          titleEnglish: "Container Collected",
          titleSomali: "Konteenarka Waa La Qaatay",
          messageEnglish: `Container ${container.containerNumber} has been successfully collected from the port.`,
          messageSomali: `Konteenarka ${container.containerNumber} si guul leh ayaa looga qaaday dekedda.`,
          sendSMS: true,
        });
      } catch (notificationError) {
        // Notification failure must not undo a successful collection.
        console.error("Collection notification failed:", notificationError);
      }

      return res.status(200).json({
        message:
          "Container successfully marked as collected.",
        container: {
          _id: updatedContainer._id,
          containerNumber: updatedContainer.containerNumber,
          currentStage: updatedContainer.currentStage,
          status: updatedContainer.status,
        },
        releaseOrder: {
          _id: releaseOrder._id,
          gateCodeUsed: releaseOrder.gateCodeUsed,
          collectedAt: releaseOrder.collectedAt,
        },
      });
    } catch (error) {
      console.error("Collect container error:", error);

      return res.status(500).json({
        message:
          "An error occurred while collecting the container.",
      });
    }
  },
);

/*
  PATCH /api/release-orders/:id/revoke

  Admin revokes a release order.

  Expected body:
  {
    "reason": "Release order revoked due to incorrect documentation."
  }
*/
router.patch(
  "/:id/revoke",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res) => {
    try {
      const { reason } = req.body;

      // Require a meaningful revocation reason.
      if (
        typeof reason !== "string" ||
        reason.trim().length < 10
      ) {
        return res.status(400).json({
          message:
            "A revocation reason of at least 10 characters is required.",
        });
      }

      // Find the release order.
      const releaseOrder = await ReleaseOrder.findById(
        req.params.id,
      );

      if (!releaseOrder) {
        return res.status(404).json({
          message: "Release order not found.",
        });
      }

      const container = await Container.findById(releaseOrder.container).select("status");
      if (container?.status === "INACTIVE") {
        return res.status(409).json({ message: "Operational release-order changes are blocked for an inactive container." });
      }

      // Claim revocation atomically so a concurrent collection cannot use this order.
      const revokedOrder = await ReleaseOrder.findOneAndUpdate(
        { _id: releaseOrder._id, isRevoked: false, gateCodeUsed: false },
        {
          $set: {
            isRevoked: true,
            revokedBy: req.user._id,
            revocationReason: reason.trim(),
            revokedAt: new Date(),
          },
        },
        { returnDocument: "after", runValidators: true },
      );

      if (!revokedOrder) {
        return res.status(409).json({
          message: "This release order has already been revoked or collected.",
        });
      }

      // Notify the importer and assigned agent that the release order was revoked.
      const notificationContainer = await Container.findById(releaseOrder.container);

      if (notificationContainer) {
        try {
          await createEventNotifications({
            recipientIds: [notificationContainer.importer, notificationContainer.assignedAgent].filter(Boolean),
            containerId: notificationContainer._id,
            type: "RELEASE_ORDER",
            titleEnglish: "Release Order Revoked",
            titleSomali: "Amarka Sii-daynta Waa La Laalay",
            messageEnglish: `The release order for container ${notificationContainer.containerNumber} has been revoked. Reason: ${reason.trim()}`,
            messageSomali: `Amarkii sii-daynta ee konteenarka ${notificationContainer.containerNumber} waa la laalay. Sababta: ${reason.trim()}`,
            sendSMS: true,
          });
        } catch (notificationError) {
          // Notification failure must not undo the revocation.
          console.error("Release order revocation notification failed:", notificationError);
        }
      }

      return res.status(200).json({
        message: "Release order revoked successfully.",
        releaseOrder: sanitizeReleaseOrder(revokedOrder, req.user.role),
      });
    } catch (error) {
      console.error("Revoke release order error:", error);

      return res.status(500).json({
        message:
          "An error occurred while revoking the release order.",
      });
    }
  },
);

/*
  GET /api/release-orders/verify/:id

  Public endpoint for checking whether a release order is valid.
  No login required.

  This endpoint does not reveal the Gate Code.
*/
router.get(
  "/verify/:id",
  async (req, res) => {
    try {
      // Find the release order.
      const releaseOrder = await ReleaseOrder.findById(
        req.params.id,
      ).populate("container", "containerNumber status");

      if (!releaseOrder || !releaseOrder.container) {
        return res.status(404).json({
          message: "Release order not found.",
        });
      }

      if (releaseOrder.container.status === "INACTIVE") {
        return res.status(200).json({
          releaseOrderId: releaseOrder._id,
          containerNumber: releaseOrder.container.containerNumber,
          isValid: false,
          isRevoked: releaseOrder.isRevoked,
          isCollected: releaseOrder.gateCodeUsed,
          message: "This release order is not operationally valid.",
        });
      }

      // Return only basic verification information.
      return res.status(200).json({
        releaseOrderId: releaseOrder._id,
        containerNumber:
          releaseOrder.container.containerNumber,
        isValid: !releaseOrder.isRevoked,
        isRevoked: releaseOrder.isRevoked,
        isCollected: releaseOrder.gateCodeUsed,
        message: releaseOrder.isRevoked
          ? "This release order has been revoked."
          : releaseOrder.gateCodeUsed
            ? "This container has already been collected."
            : "This release order is valid.",
      });
    } catch (error) {
      console.error("Verify release order error:", error);

      return res.status(500).json({
        message:
          "An error occurred while verifying the release order.",
      });
    }
  },
);

/*
  GET /api/release-orders/container/:containerId

  Authorized users view the release order for a container.
*/
router.get(
  "/container/:containerId",
  AuthMiddleware,
  async (req, res) => {
    try {
      // Find the container.
      const container = await Container.findById(
        req.params.containerId,
      );

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      // Check whether the user can access this container.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message:
            "You are not allowed to view this release order.",
        });
      }

      // Find the container's release order.
      const releaseOrder = await ReleaseOrder.findOne({
        container: container._id,
      })
        .populate("releasedBy", "fullName email")
        .populate("collectedBy", "fullName email")
        .populate("revokedBy", "fullName email");

      if (!releaseOrder) {
        return res.status(404).json({
          message:
            "No release order exists for this container.",
        });
      }

      return res.status(200).json({
        releaseOrder: sanitizeReleaseOrder(releaseOrder, req.user.role),
      });
    } catch (error) {
      console.error(
        "Get container release order error:",
        error,
      );

      return res.status(500).json({
        message:
          "An error occurred while retrieving the release order.",
      });
    }
  },
);

/*
  GET /api/release-orders/:id/pdf

  Download the generated Release Order PDF.

  Access is limited to users authorized for the connected container.
*/
router.get(
  "/:id/pdf",
  AuthMiddleware,
  async (req, res) => {
    try {
      // Find the release order.
      const releaseOrder = await ReleaseOrder.findById(
        req.params.id,
      );

      if (!releaseOrder) {
        return res.status(404).json({
          message: "Release order not found.",
        });
      }

      // Find the connected container.
      const container = await Container.findById(
        releaseOrder.container,
      );

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      // Check whether the user can access this container.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message:
            "You are not allowed to download this release order.",
        });
      }

      // Check whether a PDF has been generated.
      if (!releaseOrder.pdfPath) {
        return res.status(404).json({
          message:
            "The Release Order PDF has not been generated.",
        });
      }

      // Get the actual file location.
      const filePath = getReleaseOrderPDFPath(
        releaseOrder.pdfPath,
      );

      // Check whether the PDF file exists.
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({
          message:
            "The Release Order PDF file could not be found.",
        });
      }

      // Send the PDF as a download.
      return res.download(
        filePath,
        `Release-Order-${container.containerNumber}.pdf`,
        (error) => {
          if (error) {
            console.error(
              "Download release order PDF error:",
              error,
            );

            if (!res.headersSent) {
              res.status(500).json({
                message:
                  "An error occurred while downloading the PDF.",
              });
            }
          }
        },
      );
    } catch (error) {
      console.error(
        "Download release order PDF error:",
        error,
      );

      return res.status(500).json({
        message:
          "An error occurred while downloading the PDF.",
      });
    }
  },
);

/*
  GET /api/release-orders/:id

  Authorized users view one release order.
*/
router.get(
  "/:id",
  AuthMiddleware,
  async (req, res) => {
    try {
      // Find the release order.
      const releaseOrder = await ReleaseOrder.findById(
        req.params.id,
      )
        .populate("releasedBy", "fullName email")
        .populate("collectedBy", "fullName email")
        .populate("revokedBy", "fullName email");

      if (!releaseOrder) {
        return res.status(404).json({
          message: "Release order not found.",
        });
      }

      // Find the connected container.
      const container = await Container.findById(
        releaseOrder.container,
      );

      // Check whether the user can access the container.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message:
            "You are not allowed to view this release order.",
        });
      }

      return res.status(200).json({
        releaseOrder: sanitizeReleaseOrder(releaseOrder, req.user.role),
      });
    } catch (error) {
      console.error("Get release order error:", error);

      return res.status(500).json({
        message:
          "An error occurred while retrieving the release order.",
      });
    }
  },
);

export default router;
