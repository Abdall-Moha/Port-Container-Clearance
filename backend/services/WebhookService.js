import { randomUUID } from "node:crypto";

import WebhookDelivery from "../models/WebhookDelivery.js";
import ClearanceEvent from "../models/ClearanceEvent.js";
import Container from "../models/Container.js";

// Retry delays after unsuccessful attempts, in minutes.
const RETRY_DELAYS = [1, 2, 4];
const WEBHOOK_TIMEOUT_MS = 10000;
const WEBHOOK_LEASE_MS = 60000;

// Atomically claim one delivery whose retry time has arrived.
export async function claimDueWebhookDelivery() {
  const now = new Date();
  const token = randomUUID();

  const pendingDelivery = await WebhookDelivery.findOneAndUpdate(
    {
      status: "PENDING",
      retryCount: { $lt: 4 },
      $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
    },
    {
      $set: {
        status: "SENDING",
        processingToken: token,
        processingUntil: new Date(now.getTime() + WEBHOOK_LEASE_MS),
        lastAttemptAt: now,
        nextRetryAt: null,
      },
      $inc: { attempts: 1, retryCount: 1 },
    },
    { returnDocument: "after", sort: { nextRetryAt: 1, createdAt: 1 } },
  );

  if (pendingDelivery) {
    return pendingDelivery;
  }

  // A crashed final attempt is no longer retried because the four-attempt cycle is exhausted.
  await WebhookDelivery.updateMany(
    {
      status: "SENDING",
      retryCount: 4,
      processingUntil: { $lte: now },
    },
    {
      $set: {
        status: "FAILED",
        nextRetryAt: null,
        processingToken: null,
        processingUntil: null,
        errorMessage: "The final webhook attempt ended without a saved result.",
      },
    },
  );

  // Reclaim a sender that crashed or stopped renewing its short processing lease.
  return await WebhookDelivery.findOneAndUpdate(
    {
      status: "SENDING",
      retryCount: { $gte: 1, $lt: 4 },
      processingUntil: { $lte: now },
    },
    {
      $set: {
        processingToken: token,
        processingUntil: new Date(now.getTime() + WEBHOOK_LEASE_MS),
        lastAttemptAt: now,
      },
    },
    { returnDocument: "after", sort: { processingUntil: 1, createdAt: 1 } },
  );
}

// Send one already-claimed delivery and save the result only while this worker owns it.
export async function processClaimedWebhookDelivery(delivery) {
  if (await suppressInactiveContainerDelivery(delivery)) return await WebhookDelivery.findById(delivery._id);
  const token = delivery.processingToken;
  const attemptAt = delivery.lastAttemptAt || new Date();
  let attempt;

  try {
    // Send the event to the configured shipping line endpoint with a firm timeout.
    const response = await fetch(delivery.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event-Id": delivery.eventId,
      },
      body: JSON.stringify(delivery.payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    const responseBody = (await response.text()).slice(0, 1000);
    attempt = {
      attemptNumber: delivery.attempts,
      attemptedAt: attemptAt,
      outcome: response.ok ? "SUCCESS" : "FAILED",
      responseStatus: response.status,
      responseBody,
      errorMessage: response.ok
        ? ""
        : `Receiving system returned HTTP ${response.status}.`,
    };

    if (response.ok) {
      return await WebhookDelivery.findOneAndUpdate(
        { _id: delivery._id, status: "SENDING", processingToken: token },
        {
          $set: {
            status: "DELIVERED",
            deliveredAt: new Date(),
            nextRetryAt: null,
            responseStatus: response.status,
            responseBody,
            errorMessage: "",
            processingToken: null,
            processingUntil: null,
          },
          $push: { attemptHistory: attempt },
        },
        { returnDocument: "after" },
      );
    }

    return await saveFailedWebhookAttempt(delivery, attempt);
  } catch (error) {
    attempt = {
      attemptNumber: delivery.attempts,
      attemptedAt: attemptAt,
      outcome: "FAILED",
      responseStatus: null,
      responseBody: "",
      errorMessage: error.message,
    };

    return await saveFailedWebhookAttempt(delivery, attempt);
  }
}

// Save a failed attempt and either schedule its next delay or finish the retry cycle.
async function saveFailedWebhookAttempt(delivery, attempt) {
  const isFinalAttempt = delivery.retryCount >= 4;
  const delayMinutes = RETRY_DELAYS[delivery.retryCount - 1];
  const nextRetryAt = isFinalAttempt
    ? null
    : new Date(Date.now() + delayMinutes * 60 * 1000);

  return await WebhookDelivery.findOneAndUpdate(
    {
      _id: delivery._id,
      status: "SENDING",
      processingToken: delivery.processingToken,
    },
    {
      $set: {
        status: isFinalAttempt ? "FAILED" : "PENDING",
        nextRetryAt,
        responseStatus: attempt.responseStatus,
        responseBody: attempt.responseBody,
        errorMessage: attempt.errorMessage,
        processingToken: null,
        processingUntil: null,
      },
      $push: { attemptHistory: attempt },
    },
    { returnDocument: "after" },
  );
}

// Claim a pending delivery and perform its initial or scheduled attempt.
export async function sendWebhookDelivery(delivery) {
  if (!delivery || delivery.status === "DELIVERED") {
    return delivery;
  }

  if (await suppressInactiveContainerDelivery(delivery)) return await WebhookDelivery.findById(delivery._id);

  const claimedDelivery = await WebhookDelivery.findOneAndUpdate(
    {
      _id: delivery._id,
      status: "PENDING",
      retryCount: { $lt: 4 },
    },
    {
      $set: {
        status: "SENDING",
        processingToken: randomUUID(),
        processingUntil: new Date(Date.now() + WEBHOOK_LEASE_MS),
        lastAttemptAt: new Date(),
        nextRetryAt: null,
      },
      $inc: { attempts: 1, retryCount: 1 },
    },
    { returnDocument: "after" },
  );

  if (!claimedDelivery) {
    return await WebhookDelivery.findById(delivery._id);
  }

  return await processClaimedWebhookDelivery(claimedDelivery);
}

// Find a clearance event, create its webhook delivery, and send its first attempt.
export async function createAndSendWebhook(clearanceEventId) {
  const clearanceEvent = await ClearanceEvent.findById(clearanceEventId);

  if (!clearanceEvent) {
    throw new Error("Clearance event not found.");
  }

  const existingDelivery = await WebhookDelivery.findOne({
    eventId: String(clearanceEvent._id),
  });

  if (existingDelivery) {
    return existingDelivery;
  }

  const container = await Container.findById(clearanceEvent.container).populate({
    path: "billOfLading",
    populate: { path: "shippingLine" },
  });

  if (!container || !container.billOfLading) {
    throw new Error("Container or Bill of Lading not found.");
  }

  if (container.status === "INACTIVE") return null;

  const shippingLine = container.billOfLading.shippingLine;

  if (!shippingLine || !shippingLine.isActive || !shippingLine.webhookUrl) {
    return null;
  }

  const payload = {
    eventId: String(clearanceEvent._id),
    containerNumber: container.containerNumber,
    fromStage: clearanceEvent.fromStage,
    toStage: clearanceEvent.toStage,
    time: clearanceEvent.createdAt,
  };

  const delivery = await WebhookDelivery.create({
    shippingLine: shippingLine._id,
    container: container._id,
    clearanceEvent: clearanceEvent._id,
    eventId: String(clearanceEvent._id),
    webhookUrl: shippingLine.webhookUrl,
    payload,
  });

  return await sendWebhookDelivery(delivery);
}

// Stop queued webhook work for an inactive container while retaining its delivery history.
async function suppressInactiveContainerDelivery(delivery) {
  const container = await Container.findById(delivery.container).select("status");
  if (!container || container.status !== "INACTIVE") return false;
  await WebhookDelivery.updateOne(
    { _id: delivery._id, status: { $in: ["PENDING", "SENDING"] } },
    {
      $set: {
        status: "FAILED",
        nextRetryAt: null,
        processingToken: null,
        processingUntil: null,
        errorMessage: "Delivery stopped because the container is inactive.",
      },
    },
  );
  return true;
}
