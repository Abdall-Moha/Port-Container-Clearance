
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

// Get the current middleware folder location.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Maximum allowed file size: 5 MB.
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Define where uploaded documents will be stored.
export const UPLOAD_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "uploads",
  "documents",
);

// Create the document upload directory automatically.
fs.mkdirSync(UPLOAD_DIRECTORY, { recursive: true });

// Define where inspection photos will be stored.
export const INSPECTION_PHOTO_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "uploads",
  "inspectionPhotos",
);

// Create the inspection photos directory automatically.
fs.mkdirSync(INSPECTION_PHOTO_DIRECTORY, { recursive: true });

// Validate PDF, JPG, and PNG document files.
function documentFileFilter(req, file, callback) {
  const extension = path.extname(file.originalname).toLowerCase();

  const isPDF =
    file.mimetype === "application/pdf" &&
    extension === ".pdf";

  const isJPG =
    file.mimetype === "image/jpeg" &&
    [".jpg", ".jpeg"].includes(extension);

  const isPNG =
    file.mimetype === "image/png" &&
    extension === ".png";

  if (!isPDF && !isJPG && !isPNG) {
    return callback(
      new Error("Only PDF, JPG, and PNG files are allowed."),
    );
  }

  callback(null, true);
}

// Validate JPG and PNG inspection photos.
function inspectionPhotoFilter(req, file, callback) {
  const extension = path.extname(file.originalname).toLowerCase();

  const isJPG =
    file.mimetype === "image/jpeg" &&
    [".jpg", ".jpeg"].includes(extension);

  const isPNG =
    file.mimetype === "image/png" &&
    extension === ".png";

  if (!isJPG && !isPNG) {
    return callback(
      new Error("Only JPG and PNG inspection photos are allowed."),
    );
  }

  callback(null, true);
}

// Configure storage for document uploads.
const documentStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, UPLOAD_DIRECTORY);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    // Generate a unique filename to avoid overwriting existing files.
    callback(null, `${randomUUID()}${extension}`);
  },
});

// Configure storage for inspection photo uploads.
const inspectionPhotoStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, INSPECTION_PHOTO_DIRECTORY);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    // Generate a unique filename to avoid overwriting existing photos.
    callback(null, `${randomUUID()}${extension}`);
  },
});

// Configure Multer for document uploads.
const documentUpload = multer({
  storage: documentStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: documentFileFilter,
});

// Configure Multer for inspection photo uploads.
const inspectionPhotoUpload = multer({
  storage: inspectionPhotoStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
  fileFilter: inspectionPhotoFilter,
});

// Handle document upload errors.
export function uploadSingleDocument(req, res, next) {
  documentUpload.single("file")(req, res, (error) => {
    if (error) {
      // A Multer failure ends this upload's server-side work, so release its lease now.
      const sendErrorResponse = () => {
        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              message: "File size cannot exceed 5 MB.",
            });
          }

          return res.status(400).json({
            message: error.message,
          });
        }

        return res.status(400).json({
          message: error.message,
        });
      };

      if (req.releaseDocumentUploadReservation) {
        req.releaseDocumentUploadReservation().finally(sendErrorResponse);
        return;
      }

      return sendErrorResponse();
    }

    next();
  });
}

// Handle inspection photo upload errors.
export function uploadInspectionPhotos(req, res, next) {
  inspectionPhotoUpload.array("photos", 5)(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            message: "Each inspection photo cannot exceed 5 MB.",
          });
        }

        if (error.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            message: "You can upload a maximum of 5 inspection photos.",
          });
        }

        return res.status(400).json({
          message: error.message,
        });
      }

      return res.status(400).json({
        message: error.message,
      });
    }

    next();
  });
}
