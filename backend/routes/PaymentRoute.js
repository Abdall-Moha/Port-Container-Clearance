
import express from "express";

import Payment from "../models/Payment.js";
import ReceiptCounter from "../models/ReceiptCounter.js";
import DutyRate from "../models/DutyRate.js";
import Container from "../models/Container.js";
import ClearanceEvent from "../models/ClearanceEvent.js";
import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

import createEventNotifications from "../services/NotificationService.js";
import { createAndSendWebhook } from "../services/WebhookService.js";

const router = express.Router();

// Supported mobile money providers.
const allowedProviders = [
  "EVC_PLUS",
  "ZAAD",
  "EDAHAB",
];

// Check whether the user can access a container.
function canAccessContainer(user, container) {
  if (!user || !container) return false;

  if (
    user.role === "ADMIN" ||
    user.role === "CUSTOMS_OFFICER"
  ) {
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

// Calculate the duty using the active rate for the container's HS Chapter.
async function calculateDuty(container) {
  const hsChapter = String(container.hsCode).slice(0, 2);

  if (!/^\d{2}$/.test(hsChapter)) {
    return { error: "The HS Code must begin with a two-digit HS Chapter." };
  }

  // Find the active duty rate for this HS Chapter.
  const dutyRate = await DutyRate.findOne({
    hsChapter,
    isActive: true,
  });

  if (!dutyRate) {
    return {
      error: "Rate missing, contact Admin.",
    };
  }

  // Select the correct port fee based on container size.
  const portFee =
    container.size === "20FT"
      ? dutyRate.portFee20FT
      : dutyRate.portFee40FT;

  // Calculate customs duty plus the fixed port fee.
  const dutyAmount =
    (container.cifValue * dutyRate.dutyPercentage) / 100;

  const totalAmount = Number(
    (dutyAmount + portFee).toFixed(2),
  );

  return {
    dutyRateId: dutyRate._id,
    hsChapter,
    cifValue: container.cifValue,
    dutyPercentage: dutyRate.dutyPercentage,
    portFee,
    amount: totalAmount,
  };
}

/*
  POST /api/payments/:containerId/assess

  A Customs Officer verifies all latest documents, saves a one-time duty
  assessment snapshot, moves the container to DUTY_ASSESSED, and records its event.
  Errors: 400 invalid ID/documents/HS code, 404 missing container/rate, 409 wrong
  stage or duplicate assessment, 401/403 access, 500 database failure.
*/
router.post(
  "/:containerId/assess",
  AuthMiddleware,
  RoleMiddleware("CUSTOMS_OFFICER"),
  async (req, res) => {
    try {
      const { containerId } = req.params;

      if (!/^[0-9a-fA-F]{24}$/.test(containerId)) {
        return res.status(400).json({ message: "Invalid container ID." });
      }

      const container = await Container.findById(containerId);
      if (!container) return res.status(404).json({ message: "Container not found." });
      if (container.status === "INACTIVE") return res.status(409).json({ message: "Duty cannot be assessed for an inactive container." });
      if (container.currentStage !== "CUSTOMS_REVIEW") {
        return res.status(409).json({
          message: "Duty can only be assessed while the container is in CUSTOMS_REVIEW.",
          currentStage: container.currentStage,
        });
      }
      if (container.dutyAssessment) {
        return res.status(409).json({ message: "A duty assessment already exists for this container." });
      }

      // Every required document must have a latest version approved by Customs.
      const requiredDocumentTypes = [
        "COMMERCIAL_INVOICE",
        "PACKING_LIST",
        "BILL_OF_LADING",
        "CERTIFICATE_OF_ORIGIN",
      ];
      const documents = await Document.find({ container: container._id });
      const documentProblems = [];

      for (const documentType of requiredDocumentTypes) {
        const document = documents.find((item) => item.documentType === documentType);
        if (!document) {
          documentProblems.push(`${documentType}: missing`);
          continue;
        }

        const latestVersion = await DocumentVersion.findOne({
          document: document._id,
        }).sort({ versionNumber: -1 });

        if (!latestVersion) {
          documentProblems.push(`${documentType}: latest version is missing`);
        } else if (latestVersion.versionNumber !== document.latestVersion) {
          documentProblems.push(`${documentType}: latest version pointer is inconsistent`);
        } else if (
          document.reviewStatus !== "APPROVED" ||
          document.reviewedVersionNumber !== document.latestVersion ||
          latestVersion.reviewStatus !== "APPROVED"
        ) {
          const reviewStatus = document.reviewStatus === "REJECTED" || latestVersion.reviewStatus === "REJECTED"
            ? "rejected"
            : "pending or not approved";
          documentProblems.push(`${documentType}: ${reviewStatus}`);
        }
      }

      if (documentProblems.length > 0) {
        return res.status(400).json({
          message: "Duty assessment is blocked because required documents are missing or not approved.",
          documents: documentProblems,
        });
      }

      // Reuse the existing formula and active HS Chapter rate lookup.
      const calculation = await calculateDuty(container);
      if (calculation.error) return res.status(404).json({ message: calculation.error });

      const assessedAt = new Date();
      const assessmentSnapshot = {
        dutyRate: calculation.dutyRateId,
        hsChapter: calculation.hsChapter,
        cifValue: calculation.cifValue,
        dutyPercentage: calculation.dutyPercentage,
        portFee: calculation.portFee,
        amount: calculation.amount,
        assessedBy: req.user._id,
        assessedAt,
      };

      // Atomically save the snapshot and advance the stage, preventing duplicate assessments.
      const assessedContainer = await Container.findOneAndUpdate(
        {
          _id: container._id,
          currentStage: "CUSTOMS_REVIEW",
          status: "ACTIVE",
          // Assessment waits until every active document upload finishes or expires.
          documentUploadReservations: {
            $not: {
              $elemMatch: {
                expiresAt: { $gt: new Date() },
              },
            },
          },
          $or: [
            { dutyAssessment: { $exists: false } },
            { dutyAssessment: null },
          ],
        },
        {
          $set: {
            currentStage: "DUTY_ASSESSED",
            dutyAssessment: assessmentSnapshot,
          },
        },
        { returnDocument: "after", runValidators: true },
      );

      if (!assessedContainer) {
        return res.status(409).json({
          message: "The container changed or was assessed by another officer. Refresh and try again.",
        });
      }

      let clearanceEvent;
      try {
        clearanceEvent = await ClearanceEvent.create({
          container: container._id,
          fromStage: "CUSTOMS_REVIEW",
          toStage: "DUTY_ASSESSED",
          performedBy: req.user._id,
          reason: "Required documents approved and customs duty assessed.",
        });
      } catch (eventError) {
        // Compensate for the stage/snapshot update if its history event cannot be saved.
        try {
          await Container.findOneAndUpdate(
            {
              _id: container._id,
              currentStage: "DUTY_ASSESSED",
              "dutyAssessment.assessedAt": assessedAt,
            },
            {
              $set: { currentStage: "CUSTOMS_REVIEW" },
              $unset: { dutyAssessment: 1 },
            },
          );
        } catch (rollbackError) {
          console.error("Could not roll back duty assessment after event failure:", rollbackError.message);
        }
        throw eventError;
      }

      // Notifications and webhooks are secondary; their failure does not undo assessment.
      try {
        await createEventNotifications({
          recipientIds: [container.importer, container.assignedAgent].filter(Boolean),
          eventKey: `duty-assessed:${clearanceEvent._id}`,
          containerId: container._id,
          type: "CLEARANCE_STAGE",
          titleEnglish: "Customs Duty Assessed",
          titleSomali: "Cashuurta Kastamka Waa La Qiimeeyay",
          messageEnglish: `Customs duty for container ${container.containerNumber} has been assessed. Amount due: USD ${calculation.amount.toFixed(2)}.`,
          messageSomali: `Cashuurta kastamka ee konteenarka ${container.containerNumber} waa la qiimeeyay. Lacagta la bixinayo: USD ${calculation.amount.toFixed(2)}.`,
          sendSMS: true,
        });
      } catch (notificationError) {
        console.error("Duty assessment notification failed:", notificationError.message);
      }

      try {
        await createAndSendWebhook(clearanceEvent._id);
      } catch (webhookError) {
        console.error("Duty assessment webhook failed:", webhookError.message);
      }

      return res.status(201).json({
        message: "Duty assessment saved successfully.",
        assessment: assessedContainer.dutyAssessment,
        clearanceEvent,
      });
    } catch (error) {
      console.error("Assess duty error:", error);
      return res.status(500).json({ message: "An error occurred while assessing duty." });
    }
  },
);

// Generate a receipt number in the required format.
async function generateReceiptNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const receiptPattern = new RegExp(`^RCPT-${date}-(\\d+)$`);
  const existingReceipts = await Payment.find({
    receiptNumber: { $regex: receiptPattern },
  }).select("receiptNumber");
  const highestExistingSequence = existingReceipts.reduce((highest, payment) => {
    const match = payment.receiptNumber.match(receiptPattern);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  // Start above receipts created before the daily counter was introduced.
  try {
    await ReceiptCounter.updateOne(
      { date },
      { $max: { sequence: highestExistingSequence } },
      { upsert: true, setDefaultsOnInsert: false },
    );
  } catch (error) {
    // Another request may have created the day's counter at the same time.
    if (error.code !== 11000) throw error;
    await ReceiptCounter.updateOne(
      { date },
      { $max: { sequence: highestExistingSequence } },
    );
  }

  // Increment atomically so concurrent requests receive separate sequence numbers.
  const counter = await ReceiptCounter.findOneAndUpdate(
    { date },
    { $inc: { sequence: 1 } },
    { returnDocument: "after" },
  );

  if (!counter) throw new Error("Daily receipt counter was not found.");

  return `RCPT-${date}-${String(counter.sequence).padStart(4, "0")}`;
}

/*
  GET /api/payments/amount/:containerId

  Calculate the amount the Importer or Agent must pay.
  This endpoint does not create a payment.
*/
router.get(
  "/amount/:containerId",
  AuthMiddleware,
  RoleMiddleware("IMPORTER", "CLEARING_AGENT"),
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
        return res.status(409).json({ message: "Payment is unavailable for an inactive container." });
      }

      // Check whether the user owns or is assigned to the container.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message: "You are not allowed to access this container.",
        });
      }

      // Duty can only be paid after it has been assessed.
      if (container.currentStage !== "DUTY_ASSESSED") {
        return res.status(409).json({
          message: "This container is not ready for duty payment.",
          currentStage: container.currentStage,
        });
      }

      // Return the saved assessment so later rate changes cannot change the amount due.
      if (!container.dutyAssessment) {
        return res.status(409).json({
          message: "A saved duty assessment is required before payment.",
        });
      }

      return res.status(200).json({
        message: "Duty amount calculated successfully.",
        calculation: {
          hsChapter: container.dutyAssessment.hsChapter,
          cifValue: container.dutyAssessment.cifValue,
          dutyPercentage: container.dutyAssessment.dutyPercentage,
          portFee: container.dutyAssessment.portFee,
          amount: container.dutyAssessment.amount,
          assessedAt: container.dutyAssessment.assessedAt,
        },
      });
    } catch (error) {
      console.error("Calculate duty error:", error);

      return res.status(500).json({
        message: "An error occurred while calculating duty.",
      });
    }
  },
);

/*
  POST /api/payments/:containerId/pay

  Make a simulated mobile money payment.
  A successful payment automatically advances the container to DUTY_PAID.

  Expected body:
  {
    "provider": "EVC_PLUS",
    "phoneNumber": "+252XXXXXXXXX",
    "confirmPayment": true
  }
*/
router.post(
  "/:containerId/pay",
  AuthMiddleware,
  RoleMiddleware("IMPORTER", "CLEARING_AGENT"),
  async (req, res) => {
    try {
      const {
        provider,
        phoneNumber,
        confirmPayment,
      } = req.body;

      // Validate the selected mobile money provider.
      if (!allowedProviders.includes(provider)) {
        return res.status(400).json({
          message: "Please select a valid payment provider.",
          allowedProviders,
        });
      }

      // Validate the phone number.
      if (
        typeof phoneNumber !== "string" ||
        !/^\+?[0-9]{9,15}$/.test(phoneNumber)
      ) {
        return res.status(400).json({
          message: "Please provide a valid phone number.",
        });
      }

      // Require the user to confirm the payment.
      if (confirmPayment !== true) {
        return res.status(400).json({
          message: "Please confirm the payment before continuing.",
        });
      }

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
        return res.status(409).json({ message: "Payment is unavailable for an inactive container." });
      }

      // Check container ownership or assignment.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message: "You are not allowed to pay for this container.",
        });
      }

      // Prevent a second successful payment for the same container.
      const existingPayment = await Payment.findOne({
        container: container._id,
        status: "SUCCESS",
      });

      if (existingPayment) {
        return res.status(409).json({
          message: "Duty payment has already been completed.",
          receiptNumber: existingPayment.receiptNumber,
        });
      }

      // A pending payment can be resumed if a prior request stopped mid-process.
      let payment = await Payment.findOne({
        container: container._id,
        status: "PENDING",
      });

      if (
        payment &&
        (String(payment.paidBy) !== String(req.user._id) ||
          payment.provider !== provider ||
          payment.phoneNumber !== phoneNumber)
      ) {
        return res.status(409).json({
          message: "A payment for this container is already being finalized. Retry it with the original payment details.",
        });
      }

      // Allow a retry to finish a pending payment after the stage was already advanced.
      if (
        container.currentStage !== "DUTY_ASSESSED" &&
        !(container.currentStage === "DUTY_PAID" && payment)
      ) {
        return res.status(409).json({
          message: "This container is not ready for duty payment.",
          currentStage: container.currentStage,
        });
      }

      // Payment uses the saved amount, never a newly changed DutyRate.
      const assessment = container.dutyAssessment;
      if (!assessment) {
        return res.status(409).json({
          message: "A saved duty assessment is required before payment.",
        });
      }

      // The assessment event must exist before payment can start.
      const assessmentEvent = await ClearanceEvent.exists({
        container: container._id,
        fromStage: "CUSTOMS_REVIEW",
        toStage: "DUTY_ASSESSED",
      });
      if (!assessmentEvent) {
        return res.status(409).json({
          message: "The duty assessment history is not complete yet. Please try again shortly.",
        });
      }

      const calculation = {
        hsChapter: assessment.hsChapter,
        cifValue: assessment.cifValue,
        dutyPercentage: assessment.dutyPercentage,
        portFee: assessment.portFee,
        amount: assessment.amount,
      };

      // Simulate a failed mobile money transaction.
      // Phone numbers ending in 0000 always fail in this mock system.
      if (!payment && phoneNumber.endsWith("0000")) {
        const failedPayment = await Payment.create({
          container: container._id,
          paidBy: req.user._id,
          provider,
          phoneNumber,
          amount: calculation.amount,
          ...calculation,
          status: "FAILED",
          failureReason: "Mock payment failed. Please try again.",
        });

        // Notify the importer about the failed payment.
        try {
          await createEventNotifications({
            recipientIds: [container.importer],
            eventKey: `payment-failed:${failedPayment._id}`,
            containerId: container._id,
            type: "PAYMENT",

            titleEnglish: "Payment Failed",
            titleSomali: "Bixinta Lacagta Waa Fashilantay",

            messageEnglish: `The duty payment for container ${container.containerNumber} failed. Please try again.`,
            messageSomali: `Bixinta lacagta cashuurta konteenarka ${container.containerNumber} way fashilantay. Fadlan mar kale isku day.`,

            sendSMS: true,
          });
        } catch (notificationError) {
          // Notification failure must not change the payment result.
          console.error(
            "Failed payment notification error:",
            notificationError.message,
          );
        }

        return res.status(402).json({
          message: "Payment failed. Please try again.",
          payment: failedPayment,
        });
      }

      // Save one pending operation so simultaneous requests cannot create multiple payments.
      if (!payment) {
        try {
          payment = await Payment.create({
            container: container._id,
            paidBy: req.user._id,
            provider,
            phoneNumber,
            amount: calculation.amount,
            ...calculation,
            status: "PENDING",
          });
        } catch (error) {
          if (error.code !== 11000) throw error;

          // Another request created the pending payment first; resume that same operation.
          payment = await Payment.findOne({
            container: container._id,
            status: "PENDING",
          });
          if (!payment) throw error;

          if (
            String(payment.paidBy) !== String(req.user._id) ||
            payment.provider !== provider ||
            payment.phoneNumber !== phoneNumber
          ) {
            return res.status(409).json({
              message: "A payment for this container is already being finalized. Retry it with the original payment details.",
            });
          }
        }
      }

      // Advance the stage once. A retry can continue if an earlier request already did so.
      let updatedContainer = container;
      if (container.currentStage === "DUTY_ASSESSED") {
        updatedContainer = await Container.findOneAndUpdate(
          {
            _id: container._id,
            currentStage: "DUTY_ASSESSED",
            status: "ACTIVE",
          },
          { $set: { currentStage: "DUTY_PAID" } },
          { returnDocument: "after" },
        );

        if (!updatedContainer) {
          updatedContainer = await Container.findOne({
            _id: container._id,
            currentStage: "DUTY_PAID",
          });
        }
      }

      if (!updatedContainer || updatedContainer.currentStage !== "DUTY_PAID") {
        await Payment.findOneAndUpdate(
          { _id: payment._id, status: "PENDING" },
          {
            $set: {
              status: "FAILED",
              failureReason: "The container stage changed before payment could finish.",
            },
          },
        );

        return res.status(409).json({
          message: "Stage already changed, please refresh.",
        });
      }

      // Create or retrieve the unique history event so a retry can safely resume.
      let clearanceEvent = await ClearanceEvent.findOne({
        container: container._id,
        toStage: "DUTY_PAID",
      });
      if (!clearanceEvent) {
        try {
          clearanceEvent = await ClearanceEvent.create({
            container: container._id,
            fromStage: "DUTY_ASSESSED",
            toStage: "DUTY_PAID",
            performedBy: payment.paidBy,
            reason: "Duty payment completed successfully.",
          });
        } catch (error) {
          if (error.code !== 11000) throw error;
          clearanceEvent = await ClearanceEvent.findOne({
            container: container._id,
            toStage: "DUTY_PAID",
          });
          if (!clearanceEvent) throw error;
        }
      }

      // Assign the receipt only after the paid stage and event have been recorded.
      if (!payment.receiptNumber) {
        const receiptNumber = await generateReceiptNumber();
        const updatedPayment = await Payment.findOneAndUpdate(
          {
            _id: payment._id,
            status: "PENDING",
            $or: [
              { receiptNumber: { $exists: false } },
              { receiptNumber: null },
            ],
          },
          { $set: { receiptNumber } },
          { returnDocument: "after", runValidators: true },
        );
        payment = updatedPayment || (await Payment.findById(payment._id));
      }

      // Mark success only after both the paid stage and its history event are present.
      const completedPayment = await Payment.findOneAndUpdate(
        { _id: payment._id, status: "PENDING" },
        { $set: { status: "SUCCESS", paidAt: new Date() } },
        { returnDocument: "after", runValidators: true },
      );
      payment = completedPayment || (await Payment.findById(payment._id));
      const paymentWasCompletedHere = Boolean(completedPayment);

      if (!payment || payment.status !== "SUCCESS") {
        return res.status(409).json({
          message: "The payment is still being finalized. Please refresh shortly.",
        });
      }

      // Send side effects only for the request that changed PENDING to SUCCESS.
      if (paymentWasCompletedHere) {
        // Notify the importer and assigned agent about successful payment.
        try {
          await createEventNotifications({
            recipientIds: [
              container.importer,
              container.assignedAgent,
            ].filter(Boolean),
            eventKey: `payment-success:${payment._id}`,

            containerId: container._id,
            type: "PAYMENT",

            titleEnglish: "Duty Payment Successful",
            titleSomali: "Bixinta Lacagta Waa Guulaysatay",

            messageEnglish: `The duty payment for container ${container.containerNumber} was successful. Receipt: ${payment.receiptNumber}.`,
            messageSomali: `Bixinta lacagta cashuurta konteenarka ${container.containerNumber} way guulaysatay. Rasiidka: ${payment.receiptNumber}.`,

            sendSMS: true,
          });
        } catch (notificationError) {
          // Notification failure must not undo a successful payment.
          console.error(
            "Successful payment notification error:",
            notificationError.message,
          );
        }

        // Send the DUTY_PAID clearance event to the Shipping Line webhook.
        try {
          await createAndSendWebhook(clearanceEvent._id);
        } catch (webhookError) {
          // Webhook failure must not undo a successful payment.
          console.error(
            "Payment webhook error:",
            webhookError.message,
          );
        }
      }

      return res.status(201).json({
        message: "Payment completed successfully.",
        payment,
        container: {
          _id: updatedContainer._id,
          containerNumber: updatedContainer.containerNumber,
          currentStage: updatedContainer.currentStage,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "A successful payment already exists for this container.",
        });
      }

      console.error("Make payment error:", error);

      return res.status(500).json({
        message: "An error occurred while processing the payment.",
      });
    }
  },
);

/*
  GET /api/payments/container/:containerId

  View payment attempts and successful payments for a container.
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
          message: "You are not allowed to view these payments.",
        });
      }

      // Retrieve the container's payment history.
      const payments = await Payment.find({
        container: container._id,
      })
        .sort({ createdAt: -1 })
        .populate("paidBy", "fullName email");

      return res.status(200).json({
        totalPayments: payments.length,
        payments,
      });
    } catch (error) {
      console.error("Get payment history error:", error);

      return res.status(500).json({
        message: "An error occurred while retrieving payment history.",
      });
    }
  },
);

export default router;
