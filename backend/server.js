import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import connectDatabase from "./config/database.js";
import UserRoute from "./routes/UserRoute.js";
import PortRoute from "./routes/PortRoute.js";
import ShippingLineRoute from "./routes/ShippingLineRoute.js";
import BillOfLadingRoute from "./routes/BillOfLadingRoute.js";
import ContainerRoute from "./routes/ContainerRoute.js";
import DocumentRoute from "./routes/DocumentRoute.js";
import DocumentVersionRoute from "./routes/DocumentVersionRoute.js";

import {RateLimitingMiddleware} from "./middleware/RateLimitingMiddleware.js";
import ErrorMiddleware from "./middleware/ErrorMiddleware.js";

dotenv.config();

const app = express();

// Parses incoming JSON request bodies.
app.use(express.json());

// Allows requests from our frontend.
app.use(cors());

// Applies the general API rate limit.
app.use("/api", RateLimitingMiddleware);

// User-related routes.
app.use("/api/users", UserRoute);
app.use("/api/ports", PortRoute);
app.use("/api/shipping-lines", ShippingLineRoute);
app.use("/api/bills-of-lading", BillOfLadingRoute);
app.use("/api/containers", ContainerRoute);
app.use("/api/documents", DocumentRoute);
app.use("/api/document-versions", DocumentVersionRoute);

// Handles unknown routes.
app.use((req, res, next) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

// Must be the last middleware to handle errors.
app.use(ErrorMiddleware);

// Starts the server after connecting to MongoDB.
async function startServer() {
  try {
    await connectDatabase();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();