import {
  claimDueWebhookDelivery,
  processClaimedWebhookDelivery,
} from "./WebhookService.js";

const WORKER_INTERVAL_MS = 15000;
let workerTimer = null;
let workerIsRunning = false;

// Check for one due webhook retry on a controlled interval.
async function processOneDueDelivery() {
  if (workerIsRunning) {
    return;
  }

  workerIsRunning = true;

  try {
    const delivery = await claimDueWebhookDelivery();

    if (delivery) {
      await processClaimedWebhookDelivery(delivery);
    }
  } catch (error) {
    console.error("Webhook retry worker error:", error);
  } finally {
    workerIsRunning = false;
  }
}

// Start the retry worker after MongoDB connects; due records survive restarts.
export function startWebhookRetryWorker() {
  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(processOneDueDelivery, WORKER_INTERVAL_MS);
  workerTimer.unref();
  void processOneDueDelivery();
}
