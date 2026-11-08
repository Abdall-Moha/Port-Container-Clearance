import express from "express";

import WebhookDelivery from "../models/WebhookDelivery.js";
import Container from "../models/Container.js";
import { sendWebhookDelivery } from "../services/WebhookService.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

/*
  POST /api/webhooks/:id/resend

  Admin only.
  Manually starts a new retry cycle for a failed webhook.
*/
router.post(
  "/:id/resend",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res) => {
    try {
      // Find the webhook delivery.
      const delivery = await WebhookDelivery.findById(req.params.id);

      if (!delivery) {
        return res.status(404).json({
          message: "Webhook delivery not found.",
        });
      }

      // Only failed deliveries can be manually resent.
      if (delivery.status !== "FAILED") {
        return res.status(409).json({
          message: "Only failed webhook deliveries can be resent.",
          status: delivery.status,
        });
      }

      const container = await Container.findById(delivery.container).select("status");
      if (container?.status === "INACTIVE") {
        return res.status(409).json({ message: "A webhook for an inactive container cannot be resent." });
      }

      // Atomically start one new retry cycle without deleting attempt history.
      const retryDelivery = await WebhookDelivery.findOneAndUpdate(
        { _id: delivery._id, status: "FAILED" },
        {
          $set: {
            retryCount: 0,
            nextRetryAt: null,
            status: "PENDING",
            processingToken: null,
            processingUntil: null,
          },
        },
        { returnDocument: "after" },
      );

      if (!retryDelivery) {
        return res.status(409).json({
          message: "This webhook delivery has already been retried.",
        });
      }

      // Send the webhook again.
      const updatedDelivery = await sendWebhookDelivery(retryDelivery);

      return res.status(200).json({
        message:
          updatedDelivery.status === "DELIVERED"
            ? "Webhook resent successfully."
            : "Webhook resend failed or is waiting for an automatic retry.",
        delivery: updatedDelivery,
      });
    } catch (error) {
      console.error("Resend webhook error:", error);

      return res.status(500).json({
        message: "An error occurred while resending the webhook.",
      });
    }
  },
);

/*
  GET /api/webhooks

  Admin only.
  Retrieves all webhook delivery records.
*/
router.get(
  "/",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res) => {
    try {
      // Retrieve all webhook deliveries, newest first.
      const deliveries = await WebhookDelivery.find()
        .sort({ createdAt: -1 })
        .populate("shippingLine", "name code")
        .populate("container", "containerNumber status")
        .populate("clearanceEvent");

      return res.status(200).json({
        totalDeliveries: deliveries.length,
        deliveries,
      });
    } catch (error) {
      console.error("Get webhook deliveries error:", error);

      return res.status(500).json({
        message: "An error occurred while retrieving webhook deliveries.",
      });
    }
  },
);

/*
  GET /api/webhooks/:id

  Admin only.
  Retrieves one webhook delivery and its complete attempt history.
*/
router.get(
  "/:id",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res) => {
    try {
      // Find the requested webhook delivery.
      const delivery = await WebhookDelivery.findById(
        req.params.id,
      )
        .populate("shippingLine", "name code")
        .populate("container", "containerNumber status")
        .populate("clearanceEvent");

      if (!delivery) {
        return res.status(404).json({
          message: "Webhook delivery not found.",
        });
      }

      return res.status(200).json({
        delivery,
      });
    } catch (error) {
      console.error("Get webhook delivery error:", error);

      return res.status(500).json({
        message: "An error occurred while retrieving the webhook delivery.",
      });
    }
  },
);

export default router;
