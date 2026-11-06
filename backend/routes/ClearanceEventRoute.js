
import express from "express";

import ClearanceEvent from "../models/ClearanceEvent.js";
import Container from "../models/Container.js";

import AuthMiddleware from "../middleware/AuthMiddleware.js";

const router = express.Router();

// Check whether the logged-in user can access a container.
function canAccessContainer(user, container) {
  if (!user || !container) return false;

  // Admins and Customs Officers can access all containers.
  if (
    user.role === "ADMIN" ||
    user.role === "CUSTOMS_OFFICER"
  ) {
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

/*
  GET /api/clearance-events/container/:containerId

  Get the complete clearance history of a container.
  Events are returned from oldest to newest.
*/
router.get(
  "/container/:containerId",
  AuthMiddleware,
  async (req, res) => {
    try {
      // Find the container first.
      const container = await Container.findById(
        req.params.containerId,
      );

      if (!container) {
        return res.status(404).json({
          message: "Container not found.",
        });
      }

      // Check whether the user can view this container's history.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message: "You are not allowed to view this clearance history.",
        });
      }

      // Retrieve all events in chronological order.
      const events = await ClearanceEvent.find({
        container: container._id,
      })
        .sort({ createdAt: 1 })
        .populate("performedBy", "fullName email role");

      return res.status(200).json({
        container: {
          _id: container._id,
          containerNumber: container.containerNumber,
          currentStage: container.currentStage,
        },
        totalEvents: events.length,
        events,
      });
    } catch (error) {
      console.error("Get clearance history error:", error);

      return res.status(500).json({
        message: "An error occurred while retrieving clearance history.",
      });
    }
  },
);

/*
  GET /api/clearance-events/:id

  Get the details of one clearance event.
*/
router.get(
  "/:id",
  AuthMiddleware,
  async (req, res) => {
    try {
      // Find the requested event.
      const event = await ClearanceEvent.findById(
        req.params.id,
      ).populate("performedBy", "fullName email role");

      if (!event) {
        return res.status(404).json({
          message: "Clearance event not found.",
        });
      }

      // Find the container connected to this event.
      const container = await Container.findById(
        event.container,
      );

      // Check whether the user can access the container.
      if (!canAccessContainer(req.user, container)) {
        return res.status(403).json({
          message: "You are not allowed to view this clearance event.",
        });
      }

      return res.status(200).json({
        event,
      });
    } catch (error) {
      console.error("Get clearance event error:", error);

      return res.status(500).json({
        message: "An error occurred while retrieving the clearance event.",
      });
    }
  },
);

export default router;
