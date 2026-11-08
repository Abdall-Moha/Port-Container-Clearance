import express from "express";

import ClearanceEvent from "../models/ClearanceEvent.js";
import Container from "../models/Container.js";
import DemurrageRate from "../models/DemurrageRate.js";
import Document from "../models/Document.js";
import DocumentVersion from "../models/DocumentVersion.js";
import DutyRate from "../models/DutyRate.js";
import Inspection from "../models/Inspection.js";
import Notification from "../models/Notification.js";
import Payment from "../models/Payment.js";
import ReleaseOrder from "../models/ReleaseOrder.js";
import User from "../models/User.js";
import WebhookDelivery from "../models/WebhookDelivery.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";

const router = express.Router();
const requiredDocumentTypes = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
  "CERTIFICATE_OF_ORIGIN",
];
const clearanceStages = [
  "ARRIVED",
  "DOCUMENTS_SUBMITTED",
  "CUSTOMS_REVIEW",
  "DUTY_ASSESSED",
  "DUTY_PAID",
  "INSPECTION",
  "RELEASED",
  "COLLECTED",
];

// Load document review state without selecting private file paths or contents.
async function getDocumentSummary(containerIds) {
  if (!containerIds.length) {
    return { byContainer: new Map(), pending: 0, rejected: 0, approved: 0, assessmentReadyIds: new Set() };
  }

  const documents = await Document.find({
    container: { $in: containerIds },
    documentType: { $in: requiredDocumentTypes },
  }).select("container documentType latestVersion reviewedVersionNumber reviewStatus reviewedAt").lean();

  const documentIds = documents.map((document) => document._id);
  const latestVersions = documentIds.length
    ? await DocumentVersion.aggregate([
      { $match: { document: { $in: documentIds } } },
      { $sort: { document: 1, versionNumber: -1 } },
      { $group: { _id: "$document", versionNumber: { $first: "$versionNumber" }, reviewStatus: { $first: "$reviewStatus" }, createdAt: { $first: "$createdAt" } } },
    ])
    : [];
  const versionsByDocument = new Map(latestVersions.map((version) => [String(version._id), version]));
  const byContainer = new Map();

  for (const document of documents) {
    const containerId = String(document.container);
    const latestVersion = versionsByDocument.get(String(document._id));
    const hasCurrentVersion = Boolean(
      latestVersion &&
      latestVersion.versionNumber === document.latestVersion &&
      document.latestVersion > 0,
    );
    let status = "MISSING";
    if (hasCurrentVersion) {
      if (document.reviewStatus === "REJECTED" || latestVersion.reviewStatus === "REJECTED") status = "REJECTED";
      else if (
        document.reviewStatus === "APPROVED" &&
        document.reviewedVersionNumber === document.latestVersion &&
        latestVersion.reviewStatus === "APPROVED"
      ) status = "APPROVED";
      else status = "PENDING";
    }

    const summary = byContainer.get(containerId) || {
      documents: [],
      latestUploadAt: null,
      pending: 0,
      rejected: 0,
      approved: 0,
      completeAndApproved: true,
    };
    summary.documents.push({
      documentType: document.documentType,
      status,
      uploadedAt: hasCurrentVersion ? latestVersion.createdAt : null,
    });
    if (hasCurrentVersion && (!summary.latestUploadAt || latestVersion.createdAt > summary.latestUploadAt)) {
      summary.latestUploadAt = latestVersion.createdAt;
    }
    if (status === "PENDING") summary.pending += 1;
    if (status === "REJECTED") summary.rejected += 1;
    if (status === "APPROVED") summary.approved += 1;
    if (status !== "APPROVED") summary.completeAndApproved = false;
    byContainer.set(containerId, summary);
  }

  let pending = 0;
  let rejected = 0;
  let approved = 0;
  const assessmentReadyIds = new Set();
  for (const [containerId, summary] of byContainer) {
    pending += summary.pending;
    rejected += summary.rejected;
    approved += summary.approved;
    if (
      summary.completeAndApproved &&
      requiredDocumentTypes.every((type) => summary.documents.some((document) => document.documentType === type && document.status === "APPROVED"))
    ) assessmentReadyIds.add(containerId);
  }

  return { byContainer, pending, rejected, approved, assessmentReadyIds };
}

// Build a timeline that marks only stages at or before the container's current stage complete.
async function addProgressTimelines(containers) {
  if (!containers.length) return [];
  const events = await ClearanceEvent.find({ container: { $in: containers.map((item) => item._id) } })
    .select("container toStage createdAt")
    .sort({ createdAt: 1 })
    .lean();
  const eventsByContainer = new Map();
  for (const event of events) {
    const key = String(event.container);
    const list = eventsByContainer.get(key) || [];
    list.push(event);
    eventsByContainer.set(key, list);
  }

  return containers.map((container) => {
    const currentIndex = clearanceStages.indexOf(container.currentStage);
    const eventsForContainer = eventsByContainer.get(String(container._id)) || [];
    return {
      ...container,
      timeline: clearanceStages.map((stage, index) => {
        const stageEvent = [...eventsForContainer].reverse().find((event) => event.toStage === stage);
        const isCurrent = stage === container.currentStage;
        const isCompleted = currentIndex >= 0 && index < currentIndex && Boolean(stageEvent);
        return {
          stage,
          state: isCurrent ? "CURRENT" : isCompleted ? "COMPLETED" : "UPCOMING",
          completedAt: (isCurrent || isCompleted) ? stageEvent?.createdAt || null : null,
        };
      }),
    };
  });
}

// Return the authenticated user's own recent notifications and unread count.
async function getRecentNotifications(user) {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ recipient: user._id })
      .select("titleEnglish titleSomali messageEnglish messageSomali isRead createdAt container")
      .populate("container", "containerNumber")
      .sort({ createdAt: -1 })
      .limit(4)
      .lean(),
    Notification.countDocuments({ recipient: user._id, isRead: false }),
  ]);

  return {
    unreadCount,
    notifications: notifications.map((notification) => ({
      _id: notification._id,
      title: notification.titleEnglish,
      message: notification.messageEnglish,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      containerNumber: notification.container?.containerNumber || "",
    })),
  };
}

// Return recent system activities using only display-safe fields.
async function getAdminRecentActivity() {
  const [containers, events, reviews, payments, inspections, orders] = await Promise.all([
    Container.find().select("containerNumber createdAt").sort({ createdAt: -1 }).limit(5).lean(),
    ClearanceEvent.find().select("container toStage createdAt").populate("container", "containerNumber").sort({ createdAt: -1 }).limit(8).lean(),
    Document.find({ reviewedAt: { $ne: null } }).select("container documentType reviewStatus reviewedAt").populate("container", "containerNumber").sort({ reviewedAt: -1 }).limit(5).lean(),
    Payment.find({ status: "SUCCESS" }).select("container paidAt").populate("container", "containerNumber").sort({ paidAt: -1 }).limit(5).lean(),
    Inspection.find({ result: { $ne: "PENDING" } }).select("container result completedAt").populate("container", "containerNumber").sort({ completedAt: -1 }).limit(5).lean(),
    ReleaseOrder.find({ status: "ISSUED", isRevoked: false }).select("container status issuedAt releaseOrderNumber").populate("container", "containerNumber").sort({ issuedAt: -1 }).limit(5).lean(),
  ]);

  const activity = [
    ...containers.map((item) => ({ type: "CONTAINER_REGISTERED", label: "Container registered", containerNumber: item.containerNumber, at: item.createdAt })),
    ...events.map((item) => ({ type: item.toStage === "COLLECTED" ? "CONTAINER_COLLECTED" : "CLEARANCE_STAGE", label: item.toStage === "COLLECTED" ? "Container collected" : `Moved to ${item.toStage.replaceAll("_", " ")}`, containerNumber: item.container?.containerNumber || "", at: item.createdAt })),
    ...reviews.map((item) => ({ type: "DOCUMENT_REVIEW", label: `${item.documentType.replaceAll("_", " ")} ${item.reviewStatus.toLowerCase()}`, containerNumber: item.container?.containerNumber || "", at: item.reviewedAt })),
    ...payments.map((item) => ({ type: "PAYMENT_SUCCESS", label: "Duty payment successful", containerNumber: item.container?.containerNumber || "", at: item.paidAt })),
    ...inspections.map((item) => ({ type: "INSPECTION_RESULT", label: `Inspection ${item.result.toLowerCase()}`, containerNumber: item.container?.containerNumber || "", at: item.completedAt })),
    ...orders.map((item) => ({ type: "RELEASE_ORDER", label: `Release Order issued · ${item.releaseOrderNumber}`, containerNumber: item.container?.containerNumber || "", at: item.issuedAt })),
  ];

  return activity.filter((item) => item.at).sort((left, right) => new Date(right.at) - new Date(left.at)).slice(0, 10);
}

// Summarize the authenticated user's dashboard without accepting an owner ID from the browser.
router.get("/", AuthMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    const notificationsPromise = getRecentNotifications(user);
    let dashboard;

    if (user.role === "ADMIN") {
      const activityStartDate = new Date();
      activityStartDate.setUTCDate(1);
      activityStartDate.setUTCHours(0, 0, 0, 0);
      activityStartDate.setUTCMonth(activityStartDate.getUTCMonth() - 11);

      const [containerStageGroups, activityGroups, totalContainers, inProgress, heldOrInactive, totalUsers, activeUsers, pendingDocuments, pendingInspections, failedPayments, failedWebhooks, heldAfterFailedInspection, recentContainers] = await Promise.all([
        Container.aggregate([
          { $match: { status: { $ne: "INACTIVE" }, currentStage: { $in: clearanceStages } } },
          { $group: { _id: "$currentStage", count: { $sum: 1 } } },
        ]),
        ClearanceEvent.aggregate([
          { $match: { createdAt: { $gte: activityStartDate }, toStage: { $in: clearanceStages } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Container.countDocuments(),
        Container.countDocuments({ status: "ACTIVE", currentStage: { $nin: ["RELEASED", "COLLECTED"] } }),
        Container.countDocuments({ status: { $in: ["HELD", "INACTIVE"] } }),
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        Document.countDocuments({ reviewStatus: "PENDING" }),
        Inspection.countDocuments({ result: "PENDING" }),
        Payment.countDocuments({ status: "FAILED" }),
        WebhookDelivery.countDocuments({ status: "FAILED" }),
        Container.countDocuments({ status: "HELD", currentStage: "INSPECTION" }),
        Container.find().select("containerNumber currentStage size status importer createdAt").populate("importer", "fullName").sort({ createdAt: -1 }).limit(6).lean(),
      ]);

      const stageCounts = Object.fromEntries(containerStageGroups.map((item) => [item._id, item.count]));
      const activityCounts = new Map(activityGroups.map((item) => [item._id, item.count]));
      const activityByMonth = [];
      for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
        const monthDate = new Date(activityStartDate);
        monthDate.setUTCMonth(activityStartDate.getUTCMonth() + monthOffset);
        const month = monthDate.toISOString().slice(0, 7);
        activityByMonth.push({ month, count: activityCounts.get(month) || 0 });
      }
      const assessmentCandidates = await Container.find({ currentStage: "CUSTOMS_REVIEW", status: "ACTIVE" }).select("_id hsCode").lean();
      const assessmentDocuments = await getDocumentSummary(assessmentCandidates.map((item) => item._id));
      const candidateChapters = [...new Set(assessmentCandidates.filter((item) => assessmentDocuments.assessmentReadyIds.has(String(item._id))).map((item) => String(item.hsCode || "").slice(0, 2)).filter((item) => /^\d{2}$/.test(item)))];
      const configuredRates = await DutyRate.find({ hsChapter: { $in: candidateChapters }, isActive: true }).select("hsChapter").lean();
      const configuredChapters = new Set(configuredRates.map((item) => item.hsChapter));
      const missingDutyRateCount = candidateChapters.filter((chapter) => !configuredChapters.has(chapter)).length;
      const activeContainers = await Container.find({ status: "ACTIVE", currentStage: { $ne: "COLLECTED" } }).distinct("size");
      const activeDemurrageRates = await DemurrageRate.find({ size: { $in: activeContainers }, isActive: true }).select("size").lean();
      const configuredSizes = new Set(activeDemurrageRates.map((item) => item.size));
      const missingDemurrageSizes = activeContainers.filter((size) => !configuredSizes.has(size));
      const heldContainers = await Container.find({ status: "HELD", currentStage: "INSPECTION" }).select("containerNumber").sort({ updatedAt: -1 }).limit(5).lean();
      const failedWebhookItems = await WebhookDelivery.find({ status: "FAILED" }).select("eventId errorMessage createdAt container").populate("container", "containerNumber").sort({ updatedAt: -1 }).limit(5).lean();
      const recentActivity = await getAdminRecentActivity();

      dashboard = {
        role: user.role,
        statistics: {
          totalContainers,
          containersInProgress: inProgress,
          containersReleased: stageCounts.RELEASED || 0,
          containersCollected: stageCounts.COLLECTED || 0,
          containersHeldOrInactive: heldOrInactive,
          totalUsers,
          activeUsers,
          pendingDocumentReviews: pendingDocuments,
          pendingInspections,
          failedPayments,
          containersByStage: clearanceStages.map((stage) => ({ stage, count: stageCounts[stage] || 0 })),
          clearanceActivityByMonth: activityByMonth,
        },
        recentContainers,
        recentActivity,
        alerts: {
          failedWebhooks: { count: failedWebhooks, items: failedWebhookItems.map((item) => ({ eventId: item.eventId, containerNumber: item.container?.containerNumber || "", errorMessage: item.errorMessage, createdAt: item.createdAt })) },
          heldAfterFailedInspection: { count: heldAfterFailedInspection, items: heldContainers },
          missingDutyRates: { count: missingDutyRateCount, chapters: candidateChapters.filter((chapter) => !configuredChapters.has(chapter)) },
          missingDemurrageRates: { count: missingDemurrageSizes.length, sizes: missingDemurrageSizes },
        },
      };
    } else if (user.role === "IMPORTER") {
      const containers = await Container.find({ importer: user._id }).select("containerNumber currentStage size status arrivalDate createdAt").sort({ createdAt: -1 }).lean();
      const containerIds = containers.map((item) => item._id);
      const [documents, paymentGroups] = await Promise.all([
        getDocumentSummary(containerIds),
        Payment.aggregate([{ $match: { container: { $in: containerIds } } }, { $group: { _id: "$status", count: { $sum: 1 }, containers: { $addToSet: "$container" } } }]),
      ]);
      const paymentsByStatus = Object.fromEntries(paymentGroups.map((item) => [item._id, item]));
      const failedPaymentContainers = new Set((paymentsByStatus.FAILED?.containers || []).map(String));
      const attentionIds = new Set(containers.filter((container) => container.currentStage === "ARRIVED" || documents.byContainer.get(String(container._id))?.rejected > 0 || failedPaymentContainers.has(String(container._id))).map((container) => String(container._id)));
      const recentContainerRecords = await addProgressTimelines(containers.filter((item) => item.status !== "INACTIVE").slice(0, 6));
      const byStage = (stage) => containers.filter((item) => item.currentStage === stage).length;

      dashboard = {
        role: user.role,
        statistics: {
          totalContainers: containers.length,
          containersInProgress: containers.filter((item) => item.status === "ACTIVE" && !["RELEASED", "COLLECTED"].includes(item.currentStage)).length,
          containersReleased: byStage("RELEASED"),
          containersCollected: byStage("COLLECTED"),
          requiringAttention: attentionIds.size,
          documentsAwaitingReview: documents.pending,
          rejectedDocuments: documents.rejected,
          approvedDocuments: documents.approved,
          paymentsPending: paymentsByStatus.PENDING?.count || 0,
          paymentsSuccessful: paymentsByStatus.SUCCESS?.count || 0,
          paymentsFailed: paymentsByStatus.FAILED?.count || 0,
        },
        containers: recentContainerRecords,
      };
    } else if (user.role === "CLEARING_AGENT") {
      const containers = await Container.find({ assignedAgent: user._id }).select("containerNumber currentStage size status importer arrivalDate createdAt").populate("importer", "fullName").sort({ createdAt: -1 }).lean();
      const containerIds = containers.map((item) => item._id);
      const [documents, paymentGroups, activeOrders, collectedEvents] = await Promise.all([
        getDocumentSummary(containerIds),
        Payment.aggregate([{ $match: { container: { $in: containerIds } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
        ReleaseOrder.find({ container: { $in: containerIds }, status: "ISSUED", isRevoked: false, gateCodeUsed: false }).select("_id container status issuedAt").populate("container", "containerNumber").sort({ issuedAt: -1 }).lean(),
        ClearanceEvent.find({ container: { $in: containerIds }, toStage: "COLLECTED" }).select("container createdAt").populate("container", "containerNumber").sort({ createdAt: -1 }).limit(5).lean(),
      ]);
      const paymentsByStatus = Object.fromEntries(paymentGroups.map((item) => [item._id, item.count]));
      const collectableIds = new Set(activeOrders.map((item) => String(item.container?._id || item.container)));
      const activeContainers = containers.filter((item) => item.status !== "INACTIVE");
      const awaitingDocuments = activeContainers.filter((item) => item.currentStage === "ARRIVED" || documents.byContainer.get(String(item._id))?.rejected > 0);
      const releasedAwaitingCollection = activeContainers.filter((item) => item.currentStage === "RELEASED" && collectableIds.has(String(item._id)));
      const recentlyCollected = collectedEvents.map((event) => ({ containerNumber: event.container?.containerNumber || "", collectedAt: event.createdAt }));

      dashboard = {
        role: user.role,
        statistics: {
          totalAssignedContainers: containers.length,
          assignedInProgress: activeContainers.filter((item) => !["RELEASED", "COLLECTED"].includes(item.currentStage) && item.status === "ACTIVE").length,
          awaitingDocumentsOrCorrection: awaitingDocuments.length,
          awaitingPayment: activeContainers.filter((item) => item.currentStage === "DUTY_ASSESSED").length,
          awaitingInspectionOrRelease: activeContainers.filter((item) => ["DUTY_PAID", "INSPECTION"].includes(item.currentStage)).length,
          released: activeContainers.filter((item) => item.currentStage === "RELEASED").length,
          awaitingCollection: releasedAwaitingCollection.length,
          successfulPayments: paymentsByStatus.SUCCESS || 0,
        },
        containers: activeContainers.slice(0, 8),
        collectionEligible: releasedAwaitingCollection.slice(0, 5).map((item) => ({ _id: item._id, containerNumber: item.containerNumber, size: item.size, arrivalDate: item.arrivalDate })),
        recentlyCollected,
      };
    } else if (user.role === "CUSTOMS_OFFICER") {
      const [reviewQueueContainers, reviewQueueCount, reviewContainers, inspectionReadyContainers, inspectionReadyCount, scheduledInspections, scheduledInspectionCount, completedInspections, passedInspections, failedInspections, heldContainers, heldContainerCount, recentOrders] = await Promise.all([
        Container.find({ currentStage: "DOCUMENTS_SUBMITTED", status: { $ne: "INACTIVE" } }).select("containerNumber importer currentStage size arrivalDate createdAt").populate("importer", "fullName").sort({ createdAt: 1 }).limit(20).lean(),
        Container.countDocuments({ currentStage: "DOCUMENTS_SUBMITTED", status: { $ne: "INACTIVE" } }),
        Container.find({ currentStage: "CUSTOMS_REVIEW", status: "ACTIVE" }).select("_id containerNumber importer currentStage").populate("importer", "fullName").sort({ updatedAt: 1 }).lean(),
        Container.find({ currentStage: "DUTY_PAID", status: "ACTIVE" }).select("containerNumber importer size arrivalDate").populate("importer", "fullName").sort({ updatedAt: 1 }).limit(8).lean(),
        Container.countDocuments({ currentStage: "DUTY_PAID", status: "ACTIVE" }),
        Inspection.find({ result: "PENDING" }).select("container scheduledAt inspector result").populate("container", "containerNumber importer").populate("inspector", "fullName").sort({ scheduledAt: 1 }).limit(8).lean(),
        Inspection.countDocuments({ result: "PENDING" }),
        Inspection.countDocuments({ result: { $ne: "PENDING" } }),
        Inspection.countDocuments({ result: "PASS" }),
        Inspection.countDocuments({ result: "FAIL" }),
        Container.find({ currentStage: "INSPECTION", status: "HELD" }).select("containerNumber importer updatedAt").populate("importer", "fullName").sort({ updatedAt: -1 }).limit(8).lean(),
        Container.countDocuments({ currentStage: "INSPECTION", status: "HELD" }),
        ReleaseOrder.find({ status: "ISSUED", isRevoked: false }).select("container releaseOrderNumber issuedAt status").populate("container", "containerNumber").sort({ issuedAt: -1 }).limit(5).lean(),
      ]);
      const assessmentSummary = await getDocumentSummary(reviewContainers.map((item) => item._id));
      const eligibleAssessmentIds = assessmentSummary.assessmentReadyIds;
      const eligibleReleaseContainers = await Container.find({ currentStage: "INSPECTION", status: "ACTIVE" }).select("_id containerNumber importer").populate("importer", "fullName").lean();
      const latestInspections = await Inspection.find({ container: { $in: eligibleReleaseContainers.map((item) => item._id) } }).select("container inspectionNumber result completedAt").sort({ container: 1, inspectionNumber: -1 }).lean();
      const latestInspectionByContainer = new Map();
      for (const inspection of latestInspections) {
        if (!latestInspectionByContainer.has(String(inspection.container))) latestInspectionByContainer.set(String(inspection.container), inspection);
      }
      const activeReleaseOrders = await ReleaseOrder.find({ container: { $in: eligibleReleaseContainers.map((item) => item._id) }, status: "ISSUED", isRevoked: false }).select("container").lean();
      const activeReleaseIds = new Set(activeReleaseOrders.map((item) => String(item.container)));
      const initialReleaseCandidates = eligibleReleaseContainers
        .filter((item) => latestInspectionByContainer.get(String(item._id))?.result === "PASS" && !activeReleaseIds.has(String(item._id)))
        .map((item) => ({ ...item, isReplacement: false }));
      const releasedContainers = await Container.find({ currentStage: "RELEASED", status: "ACTIVE" }).select("_id containerNumber importer").populate("importer", "fullName").lean();
      const priorOrders = await ReleaseOrder.find({ container: { $in: releasedContainers.map((item) => item._id) } }).select("container status isRevoked createdAt").sort({ container: 1, createdAt: -1, _id: -1 }).lean();
      const latestOrderByContainer = new Map();
      for (const order of priorOrders) {
        if (!latestOrderByContainer.has(String(order.container))) latestOrderByContainer.set(String(order.container), order);
      }
      const replacementCandidates = releasedContainers
        .filter((item) => {
          const latestOrder = latestOrderByContainer.get(String(item._id));
          return Boolean(latestOrder && (latestOrder.isRevoked || latestOrder.status === "REVOKED"));
        })
        .map((item) => ({ ...item, isReplacement: true }));
      const eligibleReleases = [...initialReleaseCandidates, ...replacementCandidates];
      const documentReviewQueue = await getDocumentSummary(reviewQueueContainers.map((item) => item._id));
      const documentQueue = reviewQueueContainers.map((container) => {
        const summary = documentReviewQueue.byContainer.get(String(container._id));
        return { ...container, requiredDocumentCount: summary?.documents.length || 0, pendingReviewCount: summary?.pending || 0, rejectedCount: summary?.rejected || 0, submittedAt: summary?.latestUploadAt || container.createdAt };
      });

      dashboard = {
        role: user.role,
        statistics: {
          awaitingDocumentReview: reviewQueueCount,
          activeCustomsReviews: reviewContainers.length,
          readyForDutyAssessment: eligibleAssessmentIds.size,
          awaitingInspection: inspectionReadyCount,
          scheduledInspections: scheduledInspectionCount,
          completedInspections,
          passedInspections,
          failedInspections,
          heldAfterFailedInspection: heldContainerCount,
          eligibleForReleaseOrder: eligibleReleases.length,
        },
        documentReviewQueue: documentQueue,
        inspectionQueue: scheduledInspections.map((inspection) => ({ _id: inspection._id, containerNumber: inspection.container?.containerNumber || "", importerName: inspection.container?.importer?.fullName || "", scheduledAt: inspection.scheduledAt, inspectorName: inspection.inspector?.fullName || "Unassigned", result: inspection.result })),
        awaitingInspection: inspectionReadyContainers,
        heldContainers,
        eligibleReleaseOrders: eligibleReleases.slice(0, 8),
        recentReleaseOrders: recentOrders.map((order) => ({ _id: order._id, containerNumber: order.container?.containerNumber || "", releaseOrderNumber: order.releaseOrderNumber, issuedAt: order.issuedAt, status: order.status })),
      };
    } else {
      return res.status(403).json({ message: "Your role is not permitted to access dashboard information." });
    }

    dashboard.notifications = await notificationsPromise;
    return res.status(200).json(dashboard);
  } catch (error) {
    next(error);
  }
});

export default router;
