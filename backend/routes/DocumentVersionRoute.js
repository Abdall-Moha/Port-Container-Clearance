import express from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";
import Container from "../models/Container.js";
import User from "../models/User.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";
import {
  uploadSingleDocument,
  UPLOAD_DIRECTORY,
} from "../middleware/UploadMiddleware.js";
import createEventNotifications from "../services/NotificationService.js";

const router = express.Router();

// Allowed document types.
const allowedDocumentTypes = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
  "CERTIFICATE_OF_ORIGIN",
];

// Keep an upload reservation alive while Multer and the route process the file.
const uploadReservationLifetimeMs = 5 * 60 * 1000;
const uploadReservationHeartbeatMs = 30 * 1000;
const documentUploadStages = ["ARRIVED", "DOCUMENTS_SUBMITTED"];

// Check whether the uploaded file's actual content matches its type.
async function isValidFileSignature(filePath, mimeType) {
  const fileHandle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(8);

    const { bytesRead } = await fileHandle.read(buffer, 0, 8, 0);

    const signature = buffer.subarray(0, bytesRead);

    // Check the PDF file signature.
    if (mimeType === "application/pdf") {
      return signature.toString().startsWith("%PDF-");
    }

    // Check the JPG file signature.
    if (mimeType === "image/jpeg") {
      return (
        signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
      );
    }

    // Check the PNG file signature.
    if (mimeType === "image/png") {
      return (
        signature.length >= 8 &&
        signature.equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
      );
    }

    return false;
  } finally {
    await fileHandle.close();
  }
}

// Delete an uploaded file when its database operation fails.
async function deleteUploadedFile(filePath) {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not delete uploaded file:", error.message);
    }
  }
}

// Check whether the logged-in user can access a container.
function canAccessContainer(user, container) {
  if (!user || !container) return false;

  if (user.role === "ADMIN" || user.role === "CUSTOMS_OFFICER") {
    return true;
  }

  if (
    user.role === "IMPORTER" &&
    String(container.importer) === String(user._id)
  ) {
    return true;
  }

  if (
    user.role === "CLEARING_AGENT" &&
    String(container.assignedAgent) === String(user._id)
  ) {
    return true;
  }

  return false;
}

// Renew a live reservation so an active upload cannot be mistaken for a crashed request.
async function renewDocumentUploadReservation(req) {
  const reservation = req.documentUploadReservation;
  if (!reservation || reservation.lost || reservation.released) return false;

  const now = new Date();
  const updatedContainer = await Container.findOneAndUpdate(
    {
      _id: reservation.containerId,
      currentStage: { $in: documentUploadStages },
      status: { $ne: "INACTIVE" },
      documentUploadReservations: {
        $elemMatch: {
          reservationId: reservation.reservationId,
          expiresAt: { $gt: now },
        },
      },
    },
    {
      $set: {
        "documentUploadReservations.$.expiresAt": new Date(
          now.getTime() + uploadReservationLifetimeMs,
        ),
      },
    },
    { returnDocument: "after" },
  );

  if (!updatedContainer) {
    reservation.lost = true;
    clearInterval(reservation.heartbeat);
  }
  return Boolean(updatedContainer);
}

// Allocate a distinct version number without changing the document's current latest version.
async function allocateDocumentVersion(containerId, documentType) {
  let document;

  try {
    document = await Document.findOneAndUpdate(
      { container: containerId, documentType },
      {
        $setOnInsert: {
          container: containerId,
          documentType,
          latestVersion: 0,
          nextVersion: 0,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    // Another upload may have created the unique document record at the same time.
    if (error.code !== 11000) throw error;
    document = await Document.findOne({ container: containerId, documentType });
  }

  if (!document) throw new Error("Could not create or find the document record.");

  const latestSavedVersion = await DocumentVersion.findOne({
    document: document._id,
  })
    .sort({ versionNumber: -1 })
    .select("versionNumber");

  const highestUsedVersion = Math.max(
    document.latestVersion || 0,
    latestSavedVersion?.versionNumber || 0,
  );

  // Bring older records up to date before incrementing their version counter.
  if ((document.nextVersion || 0) < highestUsedVersion) {
    await Document.updateOne(
      {
        _id: document._id,
        $or: [
          { nextVersion: { $exists: false } },
          { nextVersion: { $lt: highestUsedVersion } },
        ],
      },
      { $set: { nextVersion: highestUsedVersion } },
    );
  }

  // This atomic increment reserves a unique number for this upload.
  const allocatedDocument = await Document.findOneAndUpdate(
    { _id: document._id },
    { $inc: { nextVersion: 1 } },
    { returnDocument: "after", runValidators: true },
  );

  if (!allocatedDocument) throw new Error("Could not reserve a document version number.");

  return {
    document: allocatedDocument,
    versionNumber: allocatedDocument.nextVersion,
  };
}

// Release the reservation after this upload's server-side work has finished.
async function releaseDocumentUploadReservation(req) {
  const reservation = req.documentUploadReservation;
  if (!reservation) return;
  if (reservation.releasePromise) return reservation.releasePromise;

  reservation.released = true;
  clearInterval(reservation.heartbeat);

  reservation.releasePromise = (async () => {
    try {
      await Container.updateOne(
        { _id: reservation.containerId },
        {
          $pull: {
            documentUploadReservations: {
              reservationId: reservation.reservationId,
            },
          },
        },
      );
    } catch (error) {
      // The lease will expire by itself if the database cannot release it now.
      console.error("Could not release document upload reservation:", error.message);
    }
  })();

  return reservation.releasePromise;
}

// Reserve the upload before Multer writes the file, without blocking concurrent uploads.
async function reserveDocumentUpload(req, res, next) {
  try {
    const { containerId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(containerId)) {
      return res.status(400).json({ message: "Invalid container ID." });
    }

    const container = await Container.findById(containerId);
    if (!container) {
      return res.status(404).json({ message: "Container not found." });
    }

    if (container.status === "INACTIVE") {
      return res.status(409).json({ message: "Documents cannot be uploaded for an inactive container." });
    }

    if (!canAccessContainer(req.user, container)) {
      return res.status(403).json({
        message: "You are not allowed to upload documents for this container.",
      });
    }

    if (!documentUploadStages.includes(container.currentStage)) {
      return res.status(409).json({
        message: "Documents can only be uploaded while the container is ARRIVED or DOCUMENTS_SUBMITTED.",
        currentStage: container.currentStage,
      });
    }

    const reservationId = randomUUID();
    const now = new Date();

    // Remove abandoned leases before reserving. Active uploads are never removed.
    await Container.updateOne(
      { _id: containerId },
      {
        $pull: {
          documentUploadReservations: { expiresAt: { $lte: now } },
        },
      },
    );

    const reservedContainer = await Container.findOneAndUpdate(
      {
        _id: containerId,
        currentStage: { $in: documentUploadStages },
        status: { $ne: "INACTIVE" },
      },
      {
        $push: {
          documentUploadReservations: {
            reservationId,
            expiresAt: new Date(now.getTime() + uploadReservationLifetimeMs),
          },
        },
      },
      { returnDocument: "after" },
    );

    if (!reservedContainer) {
      return res.status(409).json({
        message: "The container stage changed. Refresh and try again.",
      });
    }

    req.documentUploadReservation = { containerId, reservationId };
    req.releaseDocumentUploadReservation = () =>
      releaseDocumentUploadReservation(req);
    req.documentUploadReservation.heartbeat = setInterval(async () => {
      if (req.documentUploadReservation.released || req.documentUploadReservation.lost) return;
      try {
        await renewDocumentUploadReservation(req);
      } catch (error) {
        req.documentUploadReservation.lost = true;
        clearInterval(req.documentUploadReservation.heartbeat);
        console.error("Document upload reservation renewal failed:", error.message);
      }
    }, uploadReservationHeartbeatMs);
    req.documentUploadReservation.heartbeat.unref?.();

    return next();
  } catch (error) {
    console.error("Could not reserve document upload:", error);
    return res.status(500).json({
      message: "An error occurred while preparing the document upload.",
    });
  }
}

// Build the private server path from the stored filename.
function getStoredFilePath(filePath) {
  const fileName = path.basename(filePath);

  return path.join(UPLOAD_DIRECTORY, fileName);
}

// Remove private file paths before sending version information to the frontend.
function hideFilePath(version) {
  const versionObject = version.toObject ? version.toObject() : version;

  const { filePath, ...publicVersion } = versionObject;

  return publicVersion;
}

/*
  POST /api/document-versions/:containerId/upload

  Importer or Clearing Agent uploads a document.
  A new upload creates a new version.
*/
router.post(
  "/:containerId/upload",
  AuthMiddleware,
  RoleMiddleware("IMPORTER", "CLEARING_AGENT"),
  reserveDocumentUpload,
  uploadSingleDocument,
  async (req, res) => {
    let savedFilePath = null;
    let createdVersionRecord = null;

    try {
      const { containerId } = req.params;
      const { documentType } = req.body;

      // Make sure a file was uploaded.
      if (!req.file) {
        return res.status(400).json({
          message: "Please select a document to upload.",
        });
      }

      savedFilePath = req.file.path;

      // Confirm the lease is still active before changing document records.
      if (!(await renewDocumentUploadReservation(req))) {
        await deleteUploadedFile(savedFilePath);
        return res.status(409).json({
          message: "The upload reservation expired or the container stage changed. Please try again.",
        });
      }

      // Validate the requested document type.
      if (!allowedDocumentTypes.includes(documentType)) {
        await deleteUploadedFile(savedFilePath);

        return res.status(400).json({
          message: "Invalid document type.",
          allowedDocumentTypes,
        });
      }

      // Find the container receiving this document.
      const container = await Container.findById(containerId);

      if (!container) {
        await deleteUploadedFile(savedFilePath);

        return res.status(404).json({
          message: "Container not found.",
        });
      }

      if (container.status === "INACTIVE") {
        await deleteUploadedFile(savedFilePath);
        return res.status(409).json({ message: "Documents cannot be uploaded for an inactive container." });
      }

      // Check whether this user owns or is assigned to the container.
      if (!canAccessContainer(req.user, container)) {
        await deleteUploadedFile(savedFilePath);

        return res.status(403).json({
          message:
            "You are not allowed to upload documents for this container.",
        });
      }

      // Documents can be uploaded before review or after Customs returns the case for corrections.
      if (!["ARRIVED", "DOCUMENTS_SUBMITTED"].includes(container.currentStage)) {
        await deleteUploadedFile(savedFilePath);
        return res.status(409).json({
          message: "Documents can only be uploaded while the container is ARRIVED or DOCUMENTS_SUBMITTED.",
          currentStage: container.currentStage,
        });
      }

      // Check the actual content of the uploaded file.
      const validSignature = await isValidFileSignature(
        savedFilePath,
        req.file.mimetype,
      );

      if (!validSignature) {
        await deleteUploadedFile(savedFilePath);

        return res.status(400).json({
          message: "The uploaded file content does not match its file type.",
        });
      }

      // Stop before changing document records if the reservation was lost.
      if (!(await renewDocumentUploadReservation(req))) {
        await deleteUploadedFile(savedFilePath);
        return res.status(409).json({
          message: "The upload reservation expired. The document was not updated.",
        });
      }

      // Reserve a unique version number without pointing latestVersion at a missing record.
      const allocation = await allocateDocumentVersion(containerId, documentType);
      const document = allocation.document;
      const versionNumber = allocation.versionNumber;

      // Recheck the lease immediately before saving the uploaded version.
      if (!(await renewDocumentUploadReservation(req))) {
        await deleteUploadedFile(savedFilePath);
        return res.status(409).json({
          message: "The upload reservation expired. The document version was not saved.",
        });
      }

      // Save the new version information in MongoDB.
      const newVersion = await DocumentVersion.create({
        document: document._id,
        versionNumber,
        fileName: req.file.originalname,
        filePath: path.relative(process.cwd(), savedFilePath),
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user._id,
      });
      createdVersionRecord = newVersion;

      // Only move latestVersion forward after the matching version record exists.
      const latestDocument = await Document.findOneAndUpdate(
        {
          _id: document._id,
          latestVersion: { $lt: versionNumber },
        },
        {
          $set: {
            latestVersion: versionNumber,
            reviewStatus: "PENDING",
            reviewedVersionNumber: null,
            reviewedBy: null,
            reviewedAt: null,
            rejectionReason: "",
          },
        },
        { returnDocument: "after", runValidators: true },
      );
      const responseDocument =
        latestDocument || (await Document.findById(document._id));

      // Notify the importer and assigned agent about the new document upload.
      try {
        await createEventNotifications({
          recipientIds: [container.importer, container.assignedAgent].filter(
            Boolean,
          ),

          containerId: container._id,
          eventKey: `document-version:${newVersion._id}`,
          type: "GENERAL",

          titleEnglish: "New Document Uploaded",
          titleSomali: "Dukumenti Cusub Ayaa La Soo Geliyay",

          messageEnglish: `A new version of ${documentType.replaceAll("_", " ").toLowerCase()} has been uploaded for container ${container.containerNumber}. It is waiting for Customs Officer review.`,

          messageSomali: `Nooc cusub oo dukumentiga ${documentType.replaceAll("_", " ").toLowerCase()} ayaa loo soo geliyay konteenarka ${container.containerNumber}. Wuxuu sugayaa dib-u-eegista Sarkaalka Kastamka.`,

          sendSMS: true,
        });

        // Notify active Customs Officers that a new version is waiting for review.
        const customsOfficers = await User.find({
          role: "CUSTOMS_OFFICER",
          isActive: true,
        }).select("_id");
        if (customsOfficers.length > 0) {
          await createEventNotifications({
            recipientIds: customsOfficers.map((officer) => officer._id),
            eventKey: `customs-version-review:${newVersion._id}`,
            containerId: container._id,
            type: "DOCUMENT_REVIEW",
            titleEnglish: "Document Version Awaiting Review",
            titleSomali: "Nooca Dukumentiga Wuxuu Sugayaa Dib-u-eegis",
            messageEnglish: `A new ${documentType.replaceAll("_", " ").toLowerCase()} version for container ${container.containerNumber} is waiting for review.`,
            messageSomali: `Nooc cusub oo ${documentType.replaceAll("_", " ").toLowerCase()} ah ee konteenarka ${container.containerNumber} ayaa sugaya dib-u-eegis.`,
            sendSMS: false,
          });
        }
      } catch (notificationError) {
        // Notification failure must not undo a successful document upload.
        console.error(
          "Document upload notification failed:",
          notificationError.message,
        );
      }

      return res.status(201).json({
        message: "Document uploaded successfully.",
        document: {
          _id: responseDocument._id,
          documentType: responseDocument.documentType,
          latestVersion: responseDocument.latestVersion,
          reviewStatus: responseDocument.reviewStatus,
        },
        version: hideFilePath(newVersion),
      });
    } catch (error) {
      let mayDeleteFile = !createdVersionRecord;

      // Roll back a saved version if the document pointer was not moved to it.
      if (createdVersionRecord) {
        try {
          const currentDocument = await Document.findById(
            createdVersionRecord.document,
          );

          if (
            currentDocument &&
            currentDocument.latestVersion < createdVersionRecord.versionNumber
          ) {
            const removedVersion = await DocumentVersion.deleteOne({
              _id: createdVersionRecord._id,
            });
            mayDeleteFile = removedVersion.deletedCount === 1;
          }
        } catch (rollbackError) {
          // Keep both the saved file and its version record if compensation fails.
          console.error("Could not roll back document version:", rollbackError.message);
        }
      }

      // Remove the file only when no saved version record still refers to it.
      if (mayDeleteFile) {
        await deleteUploadedFile(savedFilePath);
      }

      console.error("Document upload error:", error);

      return res.status(500).json({
        message: "An error occurred while uploading the document.",
      });
    } finally {
      // Keep the reservation until all server-side database work has finished.
      await releaseDocumentUploadReservation(req);
    }
  },
);

/*
  GET /api/document-versions/:documentId

  Get all versions of a document.
  Only users allowed to access its container can view its versions.
*/
router.get("/:documentId", AuthMiddleware, async (req, res) => {
  try {
    const document = await Document.findById(req.params.documentId);

    if (!document) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    const container = await Container.findById(document.container);

    if (!canAccessContainer(req.user, container)) {
      return res.status(403).json({
        message: "You are not allowed to view these document versions.",
      });
    }

    // Get every version, from newest to oldest.
    const versions = await DocumentVersion.find({
      document: document._id,
    })
      .sort({ versionNumber: -1 })
      .populate("uploadedBy", "fullName email")
      .populate("reviewedBy", "fullName email");

    return res.status(200).json({
      document: {
        _id: document._id,
        documentType: document.documentType,
        latestVersion: document.latestVersion,
        reviewStatus: document.reviewStatus,
      },
      versions: versions.map(hideFilePath),
    });
  } catch (error) {
    console.error("Get document versions error:", error);

    return res.status(500).json({
      message: "An error occurred while retrieving document versions.",
    });
  }
});

/*
  GET /api/document-versions/:id/download

  Download a specific document version.
  The file is only available to authorized users.
*/
router.get("/:id/download", AuthMiddleware, async (req, res) => {
  try {
    const version = await DocumentVersion.findById(req.params.id);

    if (!version) {
      return res.status(404).json({
        message: "Document version not found.",
      });
    }

    const document = await Document.findById(version.document);

    if (!document) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    const container = await Container.findById(document.container);

    if (!canAccessContainer(req.user, container)) {
      return res.status(403).json({
        message: "You are not allowed to download this document.",
      });
    }

    // Rebuild the file path safely using its stored filename.
    const absoluteFilePath = getStoredFilePath(version.filePath);

    // Check whether the physical file still exists.
    try {
      await fs.access(absoluteFilePath);
    } catch {
      return res.status(404).json({
        message: "The uploaded file could not be found on the server.",
      });
    }

    // Send the file to the authorized user.
    return res.download(absoluteFilePath, version.fileName, (error) => {
      if (error && !res.headersSent) {
        console.error("Document download error:", error);

        res.status(500).json({
          message: "An error occurred while downloading the document.",
        });
      }
    });
  } catch (error) {
    console.error("Download document error:", error);

    return res.status(500).json({
      message: "An error occurred while downloading the document.",
    });
  }
});

export default router;
