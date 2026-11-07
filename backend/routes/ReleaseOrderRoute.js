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

/*
  POST /api/release-orders/:containerId/create

  Customs Officer creates a release order.

  Requirements:
  - Container must be in RELEASED stage.
  - Container must have a successful payment.
  - Container must have passed its latest inspection.

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

      // The container must already be released.
      if (container.currentStage !== "RELEASED") {
        return res.status(409).json({
          message:
            "A release order can only be created for a released container.",
          currentStage: container.currentStage,
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

        // Save the generated PDF location.
        populatedOrder.pdfPath = pdfPath;

        await populatedOrder.save();

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
          releaseOrder: populatedOrder,
        });
      } catch (generationError) {
        // Do not leave a release order without its required PDF.
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
      const releaseOrder = await ReleaseOrder.findById(
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
        return res.status(409).json({
          message:
            "Container stage already changed. Please refresh.",
        });
      }

      // Mark the Gate Code as used and record the final stage transition.
      releaseOrder.gateCodeUsed = true;
      releaseOrder.collectedBy = req.user._id;
      releaseOrder.collectedAt = new Date();

      let clearanceEvent;

      try {
        await releaseOrder.save();

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
        releaseOrder.gateCodeUsed = false;
        releaseOrder.collectedBy = null;
        releaseOrder.collectedAt = null;

        try {
          await releaseOrder.save();
        } catch (rollbackError) {
          console.error("Release order rollback failed:", rollbackError);
        }

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

      // Do not revoke an order that has already been revoked.
      if (releaseOrder.isRevoked) {
        return res.status(409).json({
          message:
            "This release order has already been revoked.",
        });
      }

      // A collected container cannot have its release order revoked.
      if (releaseOrder.gateCodeUsed) {
        return res.status(409).json({
          message:
            "A release order cannot be revoked after the container has been collected.",
        });
      }

      // Save the revocation information.
      releaseOrder.isRevoked = true;
      releaseOrder.revokedBy = req.user._id;
      releaseOrder.revocationReason = reason.trim();
      releaseOrder.revokedAt = new Date();

      await releaseOrder.save();

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
        releaseOrder,
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

      // Convert the release order into a plain object.
      const releaseOrderData = releaseOrder.toObject();

      // Importers must not see the Gate Code.
      if (req.user.role === "IMPORTER") {
        delete releaseOrderData.gateCode;
      }

      return res.status(200).json({
        releaseOrder: releaseOrderData,
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

  Access:
  - Admin
  - Customs Officer
  - Assigned Clearing Agent

  Importers cannot download this PDF because it contains the Gate Code.
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

      // Importers cannot download the PDF because it contains the Gate Code.
      if (req.user.role === "IMPORTER") {
        return res.status(403).json({
          message:
            "You are not allowed to download this release order PDF.",
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

      // Convert the release order into a plain object.
      const releaseOrderData = releaseOrder.toObject();

      // Importers must not see the Gate Code.
      if (req.user.role === "IMPORTER") {
        delete releaseOrderData.gateCode;
      }

      return res.status(200).json({
        releaseOrder: releaseOrderData,
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
