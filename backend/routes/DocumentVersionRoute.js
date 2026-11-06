import express from "express";
import fs from "fs/promises";
import path from "path";

import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";
import Container from "../models/Container.js";

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
  uploadSingleDocument,
  async (req, res) => {
    let savedFilePath = null;

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

      // Check whether this user owns or is assigned to the container.
      if (!canAccessContainer(req.user, container)) {
        await deleteUploadedFile(savedFilePath);

        return res.status(403).json({
          message:
            "You are not allowed to upload documents for this container.",
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

      // Find the document record or create it if this is the first upload.
      let document;

      try {
        document = await Document.findOneAndUpdate(
          {
            container: containerId,
            documentType,
          },
          {
            $inc: {
              latestVersion: 1,
            },
            $set: {
              reviewStatus: "PENDING",
              reviewedVersionNumber: null,
              reviewedBy: null,
              reviewedAt: null,
              rejectionReason: null,
            },
            $setOnInsert: {
              container: containerId,
              documentType,
            },
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        );
      } catch (error) {
        if (error.code === 11000) {
          await deleteUploadedFile(savedFilePath);

          return res.status(409).json({
            message: "A document upload is being processed. Please try again.",
          });
        }

        throw error;
      }

      // The latest version number is increased atomically.
      const versionNumber = document.latestVersion;

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

      // Notify the importer and assigned agent about the new document upload.
      try {
        await createEventNotifications({
          recipientIds: [container.importer, container.assignedAgent].filter(
            Boolean,
          ),

          containerId: container._id,
          type: "GENERAL",

          titleEnglish: "New Document Uploaded",
          titleSomali: "Dukumenti Cusub Ayaa La Soo Geliyay",

          messageEnglish: `A new version of ${documentType.replaceAll("_", " ").toLowerCase()} has been uploaded for container ${container.containerNumber}. It is waiting for Customs Officer review.`,

          messageSomali: `Nooc cusub oo dukumentiga ${documentType.replaceAll("_", " ").toLowerCase()} ayaa loo soo geliyay konteenarka ${container.containerNumber}. Wuxuu sugayaa dib-u-eegista Sarkaalka Kastamka.`,

          sendSMS: true,
        });
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
          _id: document._id,
          documentType: document.documentType,
          latestVersion: document.latestVersion,
          reviewStatus: document.reviewStatus,
        },
        version: hideFilePath(newVersion),
      });
    } catch (error) {
      // Remove the physical file if the database operation fails.
      await deleteUploadedFile(savedFilePath);

      console.error("Document upload error:", error);

      return res.status(500).json({
        message: "An error occurred while uploading the document.",
      });
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
