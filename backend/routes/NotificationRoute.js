
import express from "express";
import Notification from "../models/Notification.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";

const router = express.Router();

// Get the logged-in user's notifications.
router.get("/", AuthMiddleware, async (req, res, next) => {
  try {
    // Read pagination and unread-only filters from the query parameters.
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const filter = {
      recipient: req.user._id,
    };

    if (req.query.unread === "true") {
      filter.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .populate("container", "containerNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Notification.countDocuments(filter),
    ]);

    // Keep notification text in English in the API; the frontend chooses its display language.
    const localizedNotifications = notifications.map((notification) => {
      const notificationObject = notification.toObject();

      return {
        ...notificationObject,
        title: notification.titleEnglish,
        message: notification.messageEnglish,
      };
    });

    res.status(200).json({
      notifications: localizedNotifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get the number of unread notifications for the logged-in user.
router.get("/unread-count", AuthMiddleware, async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
});

// Mark one of the logged-in user's notifications as read.
router.patch("/:id/read", AuthMiddleware, async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipient: req.user._id,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    res.status(200).json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    next(error);
  }
});

// Mark all unread notifications belonging to the logged-in user as read.
router.patch("/read-all", AuthMiddleware, async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      {
        recipient: req.user._id,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.status(200).json({
      message: "All notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
