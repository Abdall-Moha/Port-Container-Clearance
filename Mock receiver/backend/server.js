
const express = require("express");

const app = express();
const port = 5001;

// Allow JSON request bodies.
app.use(express.json());

// Allow the main application and Mock Receiver frontend to communicate with this server.
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Store received webhook events temporarily in memory.
const receivedWebhooks = [];

// Receive webhook events from the main application.
app.post("/webhook", (req, res) => {
  const { eventId, containerNumber, fromStage, toStage, time } = req.body;

  if (!eventId || !containerNumber || !toStage || !time) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook data.",
    });
  }

  const webhook = {
    eventId,
    containerNumber,
    fromStage,
    toStage,
    time,
    receivedAt: new Date(),
  };

  receivedWebhooks.push(webhook);

  console.log("Webhook received:", webhook);

  return res.status(200).json({
    success: true,
    message: "Webhook received successfully.",
    eventId,
  });
});

// Return received webhook events to the Mock Receiver frontend.
app.get("/webhooks", (req, res) => {
  res.status(200).json({
    success: true,
    count: receivedWebhooks.length,
    webhooks: receivedWebhooks,
  });
});

// Start the Mock Receiver server.
app.listen(port, () => {
  console.log(`Mock Receiver running at http://localhost:${port}`);
});
