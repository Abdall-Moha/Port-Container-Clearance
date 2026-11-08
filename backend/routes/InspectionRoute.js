import express from "express";
import fs from "fs";
import Inspection from "../models/Inspection.js";
import Container from "../models/Container.js";
import Payment from "../models/Payment.js";
import User from "../models/User.js";
import ClearanceEvent from "../models/ClearanceEvent.js";
import createEventNotifications from "../services/NotificationService.js";
import { createAndSendWebhook } from "../services/WebhookService.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

import { uploadInspectionPhotos } from "../middleware/UploadMiddleware.js";

const router = express.Router();

// Check whether the logged-in user can access a container.
function canAccessContainer(user, container) {
  if (!user || !container) return false;

  // Admins and Customs Officers can access all containers.
  if (user.role === "ADMIN" || user.role === "CUSTOMS_OFFICER") {
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

// Remove private server file paths before returning inspection data.
function sanitizeInspection(inspection) {
  if (!inspection) return inspection;

  const inspectionData = inspection.toObject
    ? inspection.toObject()
    : { ...inspection };

  inspectionData.photos = (inspectionData.photos || []).map((photo) => {
    const { filePath, ...photoData } = photo;
    return photoData;
  });

  return inspectionData;
}

// Delete uploaded files from the server.
async function deleteUploadedFiles(files) {
  await Promise.all(
    (files || []).map(async (file) => {
      try {
        await fs.promises.unlink(file.path);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Delete uploaded file error:", error);
        }
      }
    }),
  );
}

// Check the actual image signature instead of trusting only the extension and MIME type.
async function isValidImageSignature(file) {
  try {
    const fileHandle = await fs.promises.open(file.path, "r");

    try {
      const buffer = Buffer.alloc(8);

      const { bytesRead } = await fileHandle.read(buffer, 0, 8, 0);

      const isJPEG =
        file.mimetype === "image/jpeg" &&
        bytesRead >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff;

      const isPNG =
        file.mimetype === "image/png" &&
        bytesRead === 8 &&
        buffer.equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );

      return isJPEG || isPNG;
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    console.error("Image signature validation error:", error);
    return false;
  }
}

// Allow the assigned inspector, or the scheduler when no inspector was assigned, to manage the attempt.
function canManageInspection(user, inspection) {
  const responsibleOfficer = inspection.inspector || inspection.scheduledBy;
  return String(responsibleOfficer) === String(user?._id);
}

/*
  POST /api/inspections/:containerId/schedule

  Customs Officer schedules an inspection.

  Expected body:
  {
    "scheduledAt": "2026-11-08T10:00:00",
    "inspectorId": "CUSTOMS_OFFICER_USER_ID" // optional
  }

  A new inspection attempt is created each time.
*/
router.post(
  "/:containerId/schedule",
  AuthMiddleware,
  RoleMiddleware("CUSTOMS_OFFICER"),
  async (req, res) => {
    try {
      const { scheduledAt, inspectorId } = req.body;

      // Validate the scheduled date.
      const inspectionDate = new Date(scheduledAt);

      if (!scheduledAt || Number.isNaN(inspectionDate.getTime())) {
        return res.status(400).json({
          message: "Please provide a valid inspection date and time.",
        });
      }

      // Inspection cannot be scheduled in the past.
      if (inspectionDate <= new Date()) {
        return res.status(400).json({
          message: "Inspection date and time cannot be in the past.",
        });
      }

      // Validate an inspector only when the Customs Officer chooses one.
      let inspector = null;
      if (inspectorId) {
        if (!/^[0-9a-fA-F]{24}$/.test(inspectorId)) {
          return res.status(400).json({ message: "Invalid Customs Officer ID." });
        }

        inspector = await User.findOne({
          _id: inspectorId,
          role: "CUSTOMS_OFFICER",
          isActive: true,
        });

        if (!inspector) {
          return res.status(400).json({
            message: "The selected inspector is not an active Customs Officer.",
          });
        }
      }

      // Find the container.
      const container = await Container.findById(req.params.containerId);

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      if (container.status === "INACTIVE") {
        return res.status(409).json({ message: "An inactive container cannot be scheduled for inspection." });
      }

      // Initial inspection: payment must already be completed.
      const isInitialInspection = container.currentStage === "DUTY_PAID";

      // A failed inspection can be rescheduled while the container is held.
      const isRescheduledInspection =
        container.currentStage === "INSPECTION" && container.status === "HELD";

      if (!isInitialInspection && !isRescheduledInspection) {
        return res.status(409).json({
          message: "This container is not ready for inspection scheduling.",
          currentStage: container.currentStage,
          status: container.status,
        });
      }

      // Do not begin inspection until the payment saga has completed its database records.
      if (isInitialInspection) {
        const successfulPayment = await Payment.exists({
          container: container._id,
          status: "SUCCESS",
        });
        const paymentEvent = await ClearanceEvent.exists({
          container: container._id,
          fromStage: "DUTY_ASSESSED",
          toStage: "DUTY_PAID",
        });

        if (!successfulPayment || !paymentEvent) {
          return res.status(409).json({
            message: "Payment finalization is still in progress. Please try again shortly.",
          });
        }
      }

      // Calculate the next inspection attempt number.
      const previousAttempts = await Inspection.countDocuments({
        container: container._id,
      });

      const inspectionNumber = previousAttempts + 1;

      // Create the inspection record.
      const inspection = await Inspection.create({
        container: container._id,
        inspectionNumber,
        scheduledAt: inspectionDate,
        inspector: inspector?._id || null,
        scheduledBy: req.user._id,
      });

      // Update the container only if its stage and status are still correct.
      const updatedContainer = await Container.findOneAndUpdate(
        isInitialInspection
          ? {
              _id: container._id,
              currentStage: "DUTY_PAID",
              status: "ACTIVE",
            }
          : {
              _id: container._id,
              currentStage: "INSPECTION",
              status: "HELD",
            },
        {
          $set: isInitialInspection
            ? {
                currentStage: "INSPECTION",
                status: "ACTIVE",
              }
            : {
                status: "ACTIVE",
              },
        },
        {
          returnDocument: "after",
        },
      );

      if (!updatedContainer) {
        // Remove the inspection record if the container could not be updated.
        await Inspection.findByIdAndDelete(inspection._id);

        return res.status(409).json({
          message: "Container status has changed. Please refresh.",
        });
      }

      // Record the initial transition in the clearance history.
      // Rescheduling does not create another stage transition.
      let clearanceEvent = null;

      if (isInitialInspection) {
        try {
          clearanceEvent = await ClearanceEvent.create({
            container: container._id,
            fromStage: "DUTY_PAID",
            toStage: "INSPECTION",
            performedBy: req.user._id,
            reason: "Container inspection scheduled.",
          });
        } catch (eventError) {
          // Restore the previous container stage if its history event cannot be saved.
          await Container.findOneAndUpdate(
            {
              _id: container._id,
              currentStage: "INSPECTION",
            },
            {
              $set: {
                currentStage: "DUTY_PAID",
                status: "ACTIVE",
              },
            },
          );

          await Inspection.findByIdAndDelete(inspection._id);
          throw eventError;
        }
      }

      // Notify the importer and assigned agent about the inspection schedule.
      try {
        await createEventNotifications({
          recipientIds: [container.importer, container.assignedAgent, inspector?._id].filter(Boolean),
          eventKey: `inspection-scheduled:${inspection._id}`,
          containerId: container._id,
          type: "INSPECTION",
          titleEnglish: isRescheduledInspection ? "Reinspection Scheduled" : "Inspection Scheduled",
          titleSomali: isRescheduledInspection ? "Dib-u-baaritaan ayaa La Qorsheeyay" : "Baaritaanka Waa La Qorsheeyay",
          messageEnglish: `${isRescheduledInspection ? "Reinspection" : "Inspection"} ${inspectionNumber} for container ${container.containerNumber} is scheduled for ${inspectionDate.toLocaleString()}.`,
          messageSomali: `${isRescheduledInspection ? "Dib-u-baaritaanka" : "Baaritaanka"} ${inspectionNumber} ee konteenarka ${container.containerNumber} waxaa loo qorsheeyay ${inspectionDate.toLocaleString()}.`,
          sendSMS: true,
        });
      } catch (notificationError) {
        // Notification failure must not undo a successful inspection schedule.
        console.error("Inspection schedule notification failed:", notificationError);
      }

      // Send a webhook only for the actual DUTY_PAID to INSPECTION transition.
      if (clearanceEvent) {
        try {
          await createAndSendWebhook(clearanceEvent._id);
        } catch (webhookError) {
          // Webhook failure must not undo the inspection schedule.
          console.error("Inspection schedule webhook failed:", webhookError);
        }
      }

      const populatedInspection = await Inspection.findById(inspection._id)
        .populate("inspector", "fullName email")
        .populate("scheduledBy", "fullName email");

      return res.status(201).json({
        message: isInitialInspection
          ? "Inspection scheduled successfully."
          : "Follow-up inspection scheduled successfully.",
        inspection: sanitizeInspection(populatedInspection),
        container: {
          _id: updatedContainer._id,
          containerNumber: updatedContainer.containerNumber,
          currentStage: updatedContainer.currentStage,
          status: updatedContainer.status,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "An inspection attempt with this number already exists.",
        });
      }

      console.error("Schedule inspection error:", error);

      return res.status(500).json({
        message: "An error occurred while scheduling the inspection.",
      });
    }
  },
);

/*
  PATCH /api/inspections/:id/result

  Assigned Customs Officer records the inspection result.

  Expected body for a successful inspection:
  {
    "result": "PASS",
    "notes": "Container inspection completed successfully."
  }

  Expected body for a failed inspection:
  {
    "result": "FAIL",
    "notes": "Inspection failed because the cargo details do not match."
  }
*/
router.patch(
  "/:id/result",
  AuthMiddleware,
  RoleMiddleware("CUSTOMS_OFFICER"),
  async (req, res) => {
    try {
      const { result, notes } = req.body;

      // Only PASS and FAIL are valid inspection results.
      if (!["PASS", "FAIL"].includes(result)) {
        return res.status(400).json({
          message: "Inspection result must be PASS or FAIL.",
        });
      }

      // A failed inspection must include a meaningful explanation.
      if (
        result === "FAIL" &&
        (typeof notes !== "string" || notes.trim().length < 10)
      ) {
        return res.status(400).json({
          message: "A failure reason of at least 10 characters is required.",
        });
      }

      // Find the inspection.
      const inspection = await Inspection.findById(req.params.id);

      if (!inspection) {
        return res.status(404).json({
          message: "Inspection not found.",
        });
      }

      // Only the assigned officer, or scheduler for an unassigned inspection, can record its result.
      if (!canManageInspection(req.user, inspection)) {
        return res.status(403).json({
          message: "Only the assigned inspector or scheduling officer can record this result.",
        });
      }

      // Do not allow the same inspection to receive multiple results.
      if (inspection.result !== "PENDING") {
        return res.status(409).json({
          message: "This inspection already has a recorded result.",
        });
      }

      // Find the container.
      const container = await Container.findById(inspection.container);

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      // The container must still be undergoing an active inspection.
      if (
        container.currentStage !== "INSPECTION" ||
        container.status !== "ACTIVE"
      ) {
        return res.status(409).json({
          message:
            "The container is no longer available for this inspection result.",
        });
      }

      // Claim the pending inspection atomically so repeated requests cannot record twice.
      const completedInspection = await Inspection.findOneAndUpdate(
        { _id: inspection._id, result: "PENDING" },
        {
          $set: {
            result,
            notes: notes?.trim() || "",
            completedAt: new Date(),
          },
        },
        { returnDocument: "after", runValidators: true },
      );

      if (!completedInspection) {
        return res.status(409).json({ message: "This inspection already has a recorded result." });
      }

      // A failed inspection preserves INSPECTION and places the container on hold.
      let updatedContainer = container;
      if (result === "FAIL") {
        try {
          updatedContainer = await Container.findOneAndUpdate(
            { _id: container._id, currentStage: "INSPECTION", status: "ACTIVE" },
            { $set: { status: "HELD" } },
            { returnDocument: "after" },
          );
        } catch (containerUpdateError) {
          await Inspection.findOneAndUpdate(
            { _id: inspection._id, result: "FAIL" },
            { $set: { result: "PENDING", notes: "", completedAt: null } },
          );
          throw containerUpdateError;
        }

        if (!updatedContainer) {
          await Inspection.findOneAndUpdate(
            { _id: inspection._id, result: "FAIL" },
            { $set: { result: "PENDING", notes: "", completedAt: null } },
          );
          return res.status(409).json({ message: "Container status changed. Please refresh." });
        }
      }

      // PASS remains at INSPECTION; Release Order creation owns the RELEASED transition.

      // Notify the importer and assigned agent about the inspection result.
      try {
        await createEventNotifications({
          recipientIds: [container.importer, container.assignedAgent].filter(Boolean),
          eventKey: `inspection-result:${completedInspection._id}:${result}`,
          containerId: container._id,
          type: "INSPECTION",
          titleEnglish: result === "PASS" ? "Inspection Passed" : "Inspection Failed",
          titleSomali: result === "PASS" ? "Baaritaanka Waa La Gudbay" : "Baaritaanka Waa Lagu Dhacay",
          messageEnglish:
            result === "PASS"
              ? `Container ${container.containerNumber} passed inspection and is eligible for a Release Order.`
              : `Container ${container.containerNumber} failed inspection and has been placed on hold. Reason: ${notes.trim()}`,
          messageSomali:
            result === "PASS"
              ? `Konteenarka ${container.containerNumber} wuu gudbay baaritaanka wuxuuna u qalmaa Amarka Sii-daynta.`
              : `Konteenarka ${container.containerNumber} wuu ku dhacay baaritaanka waxaana la saaray hakad. Sababta: ${notes.trim()}`,
          sendSMS: true,
        });
      } catch (notificationError) {
        // Notification failure must not undo a recorded inspection result.
        console.error("Inspection result notification failed:", notificationError);
      }

      const populatedInspection = await Inspection.findById(inspection._id)
        .populate("inspector", "fullName email")
        .populate("scheduledBy", "fullName email");

      return res.status(200).json({
        message:
          result === "PASS"
            ? "Inspection passed. The container is eligible for a Release Order."
            : "Inspection failed. Container has been placed on hold.",
        inspection: sanitizeInspection(populatedInspection),
        container: {
          _id: updatedContainer._id,
          containerNumber: updatedContainer.containerNumber,
          currentStage: updatedContainer.currentStage,
          status: updatedContainer.status,
        },
      });
    } catch (error) {
      console.error("Record inspection result error:", error);

      return res.status(500).json({
        message: "An error occurred while recording the inspection result.",
      });
    }
  },
);

/*
  POST /api/inspections/:id/photos

  The assigned Customs Officer uploads inspection photos.

  Form-data:
  photos: Select up to 5 JPG or PNG images.
*/
router.post(
  "/:id/photos",
  AuthMiddleware,
  RoleMiddleware("CUSTOMS_OFFICER"),
  uploadInspectionPhotos,
  async (req, res) => {
    try {
      // Require at least one photo.
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          message: "Please select at least one inspection photo.",
        });
      }

      // Find the inspection.
      const inspection = await Inspection.findById(req.params.id);

      if (!inspection) {
        await deleteUploadedFiles(req.files);

        return res.status(404).json({
          message: "Inspection not found.",
        });
      }

      // Only the assigned officer, or scheduler for an unassigned inspection, can upload photos.
      if (!canManageInspection(req.user, inspection)) {
        await deleteUploadedFiles(req.files);

        return res.status(403).json({
          message: "Only the assigned inspector or scheduling officer can upload inspection photos.",
        });
      }

      // Photos can only be uploaded while the inspection is pending.
      if (inspection.result !== "PENDING") {
        await deleteUploadedFiles(req.files);

        return res.status(409).json({
          message:
            "Photos cannot be uploaded after the inspection is completed.",
        });
      }

      // Find the container connected to this inspection.
      const container = await Container.findById(inspection.container);

      if (
        !container ||
        container.currentStage !== "INSPECTION" ||
        container.status !== "ACTIVE"
      ) {
        await deleteUploadedFiles(req.files);

        return res.status(409).json({
          message:
            "This container is not currently undergoing an active inspection.",
        });
      }

      // Do not allow more than 5 photos in total.
      if (inspection.photos.length + req.files.length > 5) {
        await deleteUploadedFiles(req.files);

        return res.status(400).json({
          message: "An inspection cannot have more than 5 photos in total.",
          currentPhotos: inspection.photos.length,
          remainingPhotos: 5 - inspection.photos.length,
        });
      }

      // Verify the actual image content before saving photo information.
      for (const file of req.files) {
        const isValid = await isValidImageSignature(file);

        if (!isValid) {
          await deleteUploadedFiles(req.files);

          return res.status(400).json({
            message: `The file "${file.originalname}" is not a valid JPG or PNG image.`,
          });
        }
      }

      // Save the uploaded photo information in the inspection document.
      const newPhotos = req.files.map((file) => ({
        fileName: file.originalname,
        filePath: file.path,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedBy: req.user._id,
        uploadedAt: new Date(),
      }));

      inspection.photos.push(...newPhotos);

      await inspection.save();

      return res.status(201).json({
        message: "Inspection photos uploaded successfully.",
        totalPhotos: inspection.photos.length,
        photos: inspection.photos.map((photo) => ({
          _id: photo._id,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
          uploadedBy: photo.uploadedBy,
          uploadedAt: photo.uploadedAt,
        })),
      });
    } catch (error) {
      // Remove uploaded files if something goes wrong while saving.
      await deleteUploadedFiles(req.files);

      console.error("Upload inspection photos error:", error);

      return res.status(500).json({
        message: "An error occurred while uploading inspection photos.",
      });
    }
  },
);

/*
  GET /api/inspections/:id/photos/:photoId

  View one inspection photo.
  Only users authorized to access the container can view it.
*/
router.get("/:id/photos/:photoId", AuthMiddleware, async (req, res) => {
  try {
    // Find the inspection.
    const inspection = await Inspection.findById(req.params.id);

    if (!inspection) {
      return res.status(404).json({
        message: "Inspection not found.",
      });
    }

    // Find the requested photo inside the inspection.
    const photo = inspection.photos.id(req.params.photoId);

    if (!photo) {
      return res.status(404).json({
        message: "Inspection photo not found.",
      });
    }

    // Find the container connected to this inspection.
    const container = await Container.findById(inspection.container);

    // Check whether the user can access the container.
    if (!canAccessContainer(req.user, container)) {
      return res.status(403).json({
        message: "You are not allowed to view this inspection photo.",
      });
    }

    // Confirm that the photo still exists on the server.
    if (!fs.existsSync(photo.filePath)) {
      return res.status(404).json({
        message: "Inspection photo file not found.",
      });
    }

    // Display the image in the browser.
    res.type(photo.mimeType);

    return res.sendFile(photo.filePath, (error) => {
      if (error && !res.headersSent) {
        console.error("View inspection photo error:", error);

        res.status(500).json({
          message: "Unable to display the inspection photo.",
        });
      }
    });
  } catch (error) {
    console.error("Get inspection photo error:", error);

    return res.status(500).json({
      message: "An error occurred while retrieving the inspection photo.",
    });
  }
});

/*
  GET /api/inspections/container/:containerId

  Get all inspection attempts for a container.
  Importer, assigned Agent, Admin, and Customs Officer can view them.
*/
router.get("/container/:containerId", AuthMiddleware, async (req, res) => {
  try {
    // Find the container.
    const container = await Container.findById(req.params.containerId);

    if (!container) {
      return res.status(404).json({
        message: "Container not found.",
      });
    }

    // Check whether the user can access this container.
    if (!canAccessContainer(req.user, container)) {
      return res.status(403).json({
        message: "You are not allowed to view these inspections.",
      });
    }

    // Retrieve every inspection attempt, newest first.
    const inspections = await Inspection.find({
      container: container._id,
    })
      .sort({ inspectionNumber: -1 })
      .populate("inspector", "fullName email")
      .populate("scheduledBy", "fullName email");

    return res.status(200).json({
      totalInspections: inspections.length,
      inspections: inspections.map(sanitizeInspection),
    });
  } catch (error) {
    console.error("Get inspection history error:", error);

    return res.status(500).json({
      message: "An error occurred while retrieving inspections.",
    });
  }
});

/*
  GET /api/inspections/:id

  Get details of one inspection.
*/
router.get("/:id", AuthMiddleware, async (req, res) => {
  try {
    // Find the requested inspection.
    const inspection = await Inspection.findById(req.params.id)
      .populate("inspector", "fullName email")
      .populate("scheduledBy", "fullName email");

    if (!inspection) {
      return res.status(404).json({
        message: "Inspection not found.",
      });
    }

    // Find the container connected to this inspection.
    const container = await Container.findById(inspection.container);

    // Check whether the user can access the container.
    if (!canAccessContainer(req.user, container)) {
      return res.status(403).json({
        message: "You are not allowed to view this inspection.",
      });
    }

    return res.status(200).json({
      inspection: sanitizeInspection(inspection),
    });
  } catch (error) {
    console.error("Get inspection error:", error);

    return res.status(500).json({
      message: "An error occurred while retrieving the inspection.",
    });
  }
});

export default router;
