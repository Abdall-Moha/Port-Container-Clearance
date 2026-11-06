import WebhookDelivery from "../models/WebhookDelivery.js";
import ClearanceEvent from "../models/ClearanceEvent.js";
import Container from "../models/Container.js";

// Retry delays after unsuccessful attempts, in minutes.
const RETRY_DELAYS = [1, 2, 4];

// Send a webhook and save the result of every attempt.
export async function sendWebhookDelivery(delivery) {
  // Do not send a webhook that is already delivered or being sent.
  if (
    delivery.status === "DELIVERED" ||
    delivery.status === "SENDING"
  ) {
    return delivery;
  }

  // Mark the delivery as being sent before making the request.
  delivery.attempts += 1;
  delivery.retryCount += 1;
  delivery.lastAttemptAt = new Date();
  delivery.status = "SENDING";
  delivery.nextRetryAt = null;

  await delivery.save();

  try {
    // Send the event to the configured shipping line endpoint.
    const response = await fetch(delivery.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event-Id": delivery.eventId,
      },
      body: JSON.stringify(delivery.payload),
      signal: AbortSignal.timeout(10000),
    });

    // Read the response returned by the receiving system.
    const responseBody = await response.text();

    const savedResponseBody = responseBody.slice(0, 1000);

    // Record this individual delivery attempt.
    delivery.attemptHistory.push({
      attemptNumber: delivery.attempts,
      attemptedAt: delivery.lastAttemptAt,
      outcome: response.ok ? "SUCCESS" : "FAILED",
      responseStatus: response.status,
      responseBody: savedResponseBody,
      errorMessage: response.ok
        ? ""
        : `Receiving system returned HTTP ${response.status}.`,
    });

    delivery.responseStatus = response.status;
    delivery.responseBody = savedResponseBody;

    // Mark the delivery successful if the receiving system responds with 2xx.
    if (response.ok) {
      delivery.status = "DELIVERED";
      delivery.deliveredAt = new Date();
      delivery.nextRetryAt = null;
      delivery.errorMessage = "";
    } else {
      // Schedule another attempt or mark the delivery as failed.
      scheduleNextRetry(delivery);
    }

    await delivery.save();

    return delivery;
  } catch (error) {
    // Record the failed attempt if the request could not be completed.
    delivery.attemptHistory.push({
      attemptNumber: delivery.attempts,
      attemptedAt: delivery.lastAttemptAt,
      outcome: "FAILED",
      responseStatus: null,
      responseBody: "",
      errorMessage: error.message,
    });

    delivery.responseStatus = null;
    delivery.responseBody = "";
    delivery.errorMessage = error.message;

    // Schedule another attempt or mark the delivery as failed.
    scheduleNextRetry(delivery);

    await delivery.save();

    return delivery;
  }
}

// Schedule the next automatic retry after an unsuccessful attempt.
function scheduleNextRetry(delivery) {
  if (delivery.retryCount >= 4) {
    delivery.status = "FAILED";
    delivery.nextRetryAt = null;
    return;
  }

  const delayMinutes = RETRY_DELAYS[delivery.retryCount - 1];

  delivery.status = "PENDING";

  delivery.nextRetryAt = new Date(
    Date.now() + delayMinutes * 60 * 1000,
  );
}

// Find a clearance event, create its webhook delivery, and send it.
export async function createAndSendWebhook(clearanceEventId) {
  // Find the clearance event that triggered the webhook.
  const clearanceEvent = await ClearanceEvent.findById(
    clearanceEventId,
  );

  if (!clearanceEvent) {
    throw new Error("Clearance event not found.");
  }

  // Prevent the same clearance event from creating another delivery.
  const existingDelivery = await WebhookDelivery.findOne({
    eventId: String(clearanceEvent._id),
  });

  if (existingDelivery) {
    return existingDelivery;
  }

  // Find the container and its shipping line.
  const container = await Container.findById(
    clearanceEvent.container,
  ).populate({
    path: "billOfLading",
    populate: {
      path: "shippingLine",
    },
  });

  if (!container || !container.billOfLading) {
    throw new Error("Container or Bill of Lading not found.");
  }

  const shippingLine = container.billOfLading.shippingLine;

  // Do not send an event if the shipping line is inactive.
  if (!shippingLine || !shippingLine.isActive) {
    return null;
  }

  // Check whether the shipping line has configured a webhook URL.
  if (!shippingLine.webhookUrl) {
    return null;
  }

  // Create the information sent to the receiving system.
  const payload = {
    eventId: String(clearanceEvent._id),
    containerNumber: container.containerNumber,
    fromStage: clearanceEvent.fromStage,
    toStage: clearanceEvent.toStage,
    time: clearanceEvent.createdAt,
  };

  // Create the delivery record before sending the webhook.
  const delivery = await WebhookDelivery.create({
    shippingLine: shippingLine._id,
    container: container._id,
    clearanceEvent: clearanceEvent._id,
    eventId: String(clearanceEvent._id),
    webhookUrl: shippingLine.webhookUrl,
    payload,
  });

  // Send the newly created webhook delivery.
  return await sendWebhookDelivery(delivery);
}