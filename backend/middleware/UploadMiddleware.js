
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

// Get the current middleware folder location.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define where uploaded documents will be stored.
export const UPLOAD_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "uploads",
  "documents",
);

// Create the upload directory automatically if it does not exist.
fs.mkdirSync(UPLOAD_DIRECTORY, { recursive: true });

// Maximum allowed file size: 5 MB.
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Accepts only PDF, JPG, and PNG files.
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, UPLOAD_DIRECTORY);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    // Generate a unique filename to avoid overwriting existing files.
    const uniqueFileName = `${randomUUID()}${extension}`;

    callback(null, uniqueFileName);
  },
});

// Validate the file extension and MIME type.
function fileFilter(req, file, callback) {
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

// Configure Multer to save uploaded files on the server.
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

// Handle Multer errors and return understandable upload messages.
export function uploadSingleDocument(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (error) {
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
    }

    next();
  });
}
