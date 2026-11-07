
import express from "express";

import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";
import Container from "../models/Container.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

import createEventNotifications from "../services/NotificationService.js";

const router = express.Router();

// Checks whether a user is allowed to access a container's documents.
// Importers can access their own containers.
// Agents can access containers assigned to them.
// Admins and Customs Officers can access all containers.
function canAccessContainer(user, container) {
  if (user.role === "IMPORTER") {
    return container.importer.equals(user._id);
  }

  if (user.role === "CLEARING_AGENT") {
    return (
      container.assignedAgent &&
      container.assignedAgent.equals(user._id)
    );
  }

  return ["ADMIN", "CUSTOMS_OFFICER"].includes(user.role);
}

// GET /api/documents/container/:containerId
// Admin, Customs Officer, owning Importer, or assigned Agent.
// Returns all document records and their latest uploaded versions.
router.get(
  "/container/:containerId",
  AuthMiddleware,
  async (req, res, next) => {
    try {
      const { containerId } = req.params;

      if (!/^[0-9a-fA-F]{24}$/.test(containerId)) {
        return res.status(400).json({
          message: "Invalid container ID.",
        });
      }

      const container = await Container.findById(containerId);

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message: "You do not have permission to view these documents.",
        });
      }

      const documents = await Document.find({
        container: containerId,
      })
        .populate("reviewedBy", "fullName role")
        .sort({ documentType: 1 });

      // Retrieve the newest version for each document.
      const documentsWithLatestVersion = await Promise.all(
        documents.map(async (document) => {
          const latestVersion = await DocumentVersion.findOne({
            document: document._id,
            versionNumber: document.latestVersion,
          }).populate("uploadedBy", "fullName role");

          return {
            ...document.toObject(),
            latestVersionDetails: latestVersion
              ? {
                  id: latestVersion._id,
                  versionNumber: latestVersion.versionNumber,
                  fileName: latestVersion.fileName,
                  mimeType: latestVersion.mimeType,
                  fileSize: latestVersion.fileSize,
                  uploadedBy: latestVersion.uploadedBy,
                  uploadedAt: latestVersion.createdAt,
                  reviewStatus: latestVersion.reviewStatus,
                }
              : null,
          };
        }),
      );

      return res.status(200).json({
        count: documentsWithLatestVersion.length,
        documents: documentsWithLatestVersion,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/documents/:id
// Admin, Customs Officer, owning Importer, or assigned Agent.
// Returns one document and its latest version information.
router.get("/:id", AuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        message: "Invalid document ID.",
      });
    }

    const document = await Document.findById(id)
      .populate("reviewedBy", "fullName role");

    if (!document) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    const container = await Container.findById(document.container);

    if (!container) {
      return res.status(404).json({
        message: "Related container not found.",
      });
    }

    if (!canAccessContainer(req.user, container)) {
      return res.status(403).json({
        message: "You do not have permission to view this document.",
      });
    }

    const latestVersion = await DocumentVersion.findOne({
      document: document._id,
      versionNumber: document.latestVersion,
    }).populate("uploadedBy", "fullName role");

    return res.status(200).json({
      document,
      latestVersion,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/documents/:id/review
// Customs Officer only.
// Accepts versionNumber, status, and rejectionReason.
// Reviews only the latest version and prevents reviewing an outdated version.
router.patch(
  "/:id/review",
  AuthMiddleware,
  RoleMiddleware("CUSTOMS_OFFICER"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { versionNumber, status, rejectionReason } = req.body;

      if (!/^[0-9a-fA-F]{24}$/.test(id)) {
        return res.status(400).json({
          message: "Invalid document ID.",
        });
      }

      if (
        !Number.isInteger(versionNumber) ||
        versionNumber < 1
      ) {
        return res.status(400).json({
          message: "A valid version number is required.",
        });
      }

      if (!["APPROVED", "REJECTED"].includes(status)) {
        return res.status(400).json({
          message: "Review status must be APPROVED or REJECTED.",
        });
      }

      if (
        status === "REJECTED" &&
        (!rejectionReason ||
          typeof rejectionReason !== "string" ||
          rejectionReason.trim().length < 10)
      ) {
        return res.status(400).json({
          message: "Rejection reason must contain at least 10 characters.",
        });
      }

      const document = await Document.findById(id);

      if (!document) {
        return res.status(404).json({
          message: "Document not found.",
        });
      }

      const container = await Container.findById(document.container);

      if (!container) {
        return res.status(404).json({
          message: "Related container not found.",
        });
      }

      // Document reviews belong to the Customs Review stage and must stop before assessment.
      if (container.currentStage !== "CUSTOMS_REVIEW") {
        return res.status(409).json({
          message: "Documents can only be reviewed while the container is in CUSTOMS_REVIEW.",
          currentStage: container.currentStage,
        });
      }

      // Do not review an older pointer if a saved version was left unfinalized.
      const newestSavedVersion = await DocumentVersion.findOne({
        document: document._id,
      })
        .sort({ versionNumber: -1 })
        .select("versionNumber");

      if (
        !newestSavedVersion ||
        newestSavedVersion.versionNumber !== document.latestVersion
      ) {
        return res.status(409).json({
          message: "The latest saved document version is not finalized. Upload the document again before review.",
        });
      }

      // Never allow an Officer to review an older version.
      if (document.latestVersion !== versionNumber) {
        return res.status(409).json({
          message: "A newer document version exists. Refresh and review the latest version.",
          latestVersion: document.latestVersion,
        });
      }

      const reviewDate = new Date();
      const cleanReason =
        status === "REJECTED" ? rejectionReason.trim() : "";

      // Atomically update only if the version is still the latest
      // and the document is still awaiting review.
      const updatedDocument = await Document.findOneAndUpdate(
        {
          _id: id,
          latestVersion: versionNumber,
          reviewStatus: "PENDING",
        },
        {
          $set: {
            reviewStatus: status,
            reviewedVersionNumber: versionNumber,
            reviewedBy: req.user._id,
            reviewedAt: reviewDate,
            rejectionReason: cleanReason,
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        },
      );

      if (!updatedDocument) {
        return res.status(409).json({
          message: "This document has already been reviewed or a newer version was uploaded. Refresh and try again.",
        });
      }

      // Save the review on the individual version as well.
      await DocumentVersion.findOneAndUpdate(
        {
          document: id,
          versionNumber,
        },
        {
          $set: {
            reviewStatus: status,
            reviewedBy: req.user._id,
            reviewedAt: reviewDate,
            rejectionReason: cleanReason,
          },
        },
      );

      // Notify the importer and assigned agent about the review result.
      try {
        await createEventNotifications({
          recipientIds: [
            container.importer,
            container.assignedAgent,
          ].filter(Boolean),

          containerId: container._id,
          type: "DOCUMENT_REVIEW",

          titleEnglish: `Document ${status}`,
          titleSomali:
            status === "APPROVED"
              ? "Dukumentiga Waa La Ansixiyay"
              : "Dukumentiga Waa La Diiday",

          messageEnglish:
            status === "APPROVED"
              ? `Your ${updatedDocument.documentType} document for container ${container.containerNumber} has been approved.`
              : `Your ${updatedDocument.documentType} document for container ${container.containerNumber} has been rejected. Reason: ${cleanReason}`,

          messageSomali:
            status === "APPROVED"
              ? `Dukumentiga ${updatedDocument.documentType} ee konteenarka ${container.containerNumber} waa la ansixiyay.`
              : `Dukumentiga ${updatedDocument.documentType} ee konteenarka ${container.containerNumber} waa la diiday. Sababta: ${cleanReason}`,

          sendSMS: true,
        });
      } catch (notificationError) {
        // Notification failure must not undo a completed document review.
        console.error(
          "Document review notification failed:",
          notificationError.message,
        );
      }

      return res.status(200).json({
        message: `Document ${status.toLowerCase()} successfully.`,
        document: updatedDocument,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
