
import express from "express";

import Payment from "../models/Payment.js";
import DutyRate from "../models/DutyRate.js";
import Container from "../models/Container.js";
import ClearanceEvent from "../models/ClearanceEvent.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

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
    hsChapter,
    cifValue: container.cifValue,
    dutyPercentage: dutyRate.dutyPercentage,
    portFee,
    amount: totalAmount,
  };
}

// Generate a receipt number in the required format.
async function generateReceiptNumber() {
  const now = new Date();

  // Use the current UTC date for the receipt.
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Count payments created today to get the next receipt number.
  const count = await Payment.countDocuments({
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  return `RCPT-${date}-${String(count + 1).padStart(4, "0")}`;
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

      // Calculate the duty using the current active rate.
      const calculation = await calculateDuty(container);

      if (calculation.error) {
        return res.status(404).json({
          message: calculation.error,
        });
      }

      return res.status(200).json({
        message: "Duty amount calculated successfully.",
        calculation,
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
    "phoneNumber": "252XXXXXXXXX",
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

      // Check container ownership or assignment.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message: "You are not allowed to pay for this container.",
        });
      }

      // Payment is only allowed at the DUTY_ASSESSED stage.
      if (container.currentStage !== "DUTY_ASSESSED") {
        return res.status(409).json({
          message: "This container is not ready for duty payment.",
          currentStage: container.currentStage,
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

      // Calculate the exact amount on the backend.
      const calculation = await calculateDuty(container);

      if (calculation.error) {
        return res.status(404).json({
          message: calculation.error,
        });
      }

      // Simulate a failed mobile money transaction.
      // Phone numbers ending in 0000 always fail in this mock system.
      if (phoneNumber.endsWith("0000")) {
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

        return res.status(402).json({
          message: "Payment failed. Please try again.",
          payment: failedPayment,
        });
      }

      // Create a pending payment record before advancing the container.
      const payment = await Payment.create({
        container: container._id,
        paidBy: req.user._id,
        provider,
        phoneNumber,
        amount: calculation.amount,
        ...calculation,
        status: "PENDING",
      });

      // Change the stage only if it is still DUTY_ASSESSED.
      // This prevents two simultaneous payment requests from succeeding.
      const updatedContainer = await Container.findOneAndUpdate(
        {
          _id: container._id,
          currentStage: "DUTY_ASSESSED",
        },
        {
          $set: {
            currentStage: "DUTY_PAID",
          },
        },
        {
          new: true,
        },
      );

      if (!updatedContainer) {
        payment.status = "FAILED";
        payment.failureReason =
          "The container stage has already changed. Please refresh.";

        await payment.save();

        return res.status(409).json({
          message: "Stage already changed, please refresh.",
        });
      }

      // Record the successful stage transition in the clearance history.
      await ClearanceEvent.create({
        container: container._id,
        fromStage: "DUTY_ASSESSED",
        toStage: "DUTY_PAID",
        performedBy: req.user._id,
        reason: "Duty payment completed successfully.",
      });

      // Generate the receipt after successful payment.
      payment.receiptNumber = await generateReceiptNumber();
      payment.status = "SUCCESS";
      payment.paidAt = new Date();

      await payment.save();

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
