import express from "express";

import ClearanceEvent from "../models/ClearanceEvent.js";
import Container from "../models/Container.js";
import Document from "../models/Document.js";
import Inspection from "../models/Inspection.js";
import Payment from "../models/Payment.js";
import AuthMiddleware from "../middleware/AuthMiddleware.js";
import RoleMiddleware from "../middleware/RoleMiddleware.js";

const router = express.Router();

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

// Return validated date bounds for report filters, including the whole end date.
function readDateRange(query) {
  const range = {};

  for (const [key, value] of [["from", query.dateFrom], ["to", query.dateTo]]) {
    if (value === undefined || value === "") continue;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return { error: `${key} date is invalid.` };
    if (key === "from") range.$gte = parsed;
    else {
      parsed.setUTCHours(23, 59, 59, 999);
      range.$lte = parsed;
    }
  }

  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    return { error: "The start date must be on or before the end date." };
  }
  return { range: Object.keys(range).length ? range : null };
}

/*
  GET /api/reports/overview
  Admin only. Aggregates operational report data from saved database records.
*/
router.get(
  "/overview",
  AuthMiddleware,
  RoleMiddleware("ADMIN"),
  async (req, res, next) => {
    try {
      const dateResult = readDateRange(req.query);
      if (dateResult.error) return res.status(400).json({ message: dateResult.error });

      const stage = req.query.stage;
      const size = req.query.size;
      const containerStatus = req.query.containerStatus;
      const containerNumber = String(req.query.containerNumber || "").trim();
      const paymentStatus = req.query.paymentStatus;
      const inspectionResult = req.query.inspectionResult;

      if (stage && !clearanceStages.includes(stage)) {
        return res.status(400).json({ message: "Stage filter is invalid." });
      }
      if (size && !["20FT", "40FT"].includes(size)) {
        return res.status(400).json({ message: "Container size filter is invalid." });
      }
      if (containerStatus && !["ACTIVE", "HELD", "COMPLETED", "INACTIVE"].includes(containerStatus)) {
        return res.status(400).json({ message: "Container status filter is invalid." });
      }
      if (containerNumber.length > 30) {
        return res.status(400).json({ message: "Container search must be 30 characters or fewer." });
      }
      if (paymentStatus && !["PENDING", "SUCCESS", "FAILED"].includes(paymentStatus)) {
        return res.status(400).json({ message: "Payment status filter is invalid." });
      }
      if (inspectionResult && !["PENDING", "PASS", "FAIL"].includes(inspectionResult)) {
        return res.status(400).json({ message: "Inspection result filter is invalid." });
      }

      const containerFilter = {};
      if (stage) containerFilter.currentStage = stage;
      if (size) containerFilter.size = size;
      if (containerStatus) containerFilter.status = containerStatus;
      if (containerNumber) {
        const escapedContainerNumber = containerNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        containerFilter.containerNumber = { $regex: escapedContainerNumber, $options: "i" };
      }
      if (dateResult.range) containerFilter.arrivalDate = dateResult.range;

      const [containerIds, containers, totalContainers, inProgressContainers, heldOrInactiveContainers] = await Promise.all([
        Container.distinct("_id", containerFilter),
        Container.find(containerFilter)
        .select("containerNumber currentStage size importer assignedAgent arrivalDate status createdAt updatedAt dutyAssessment")
        .populate("importer", "fullName")
        .populate("assignedAgent", "fullName")
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean(),
        Container.countDocuments(containerFilter),
        Container.countDocuments({ ...containerFilter, status: "ACTIVE", currentStage: { $nin: ["RELEASED", "COLLECTED"] } }),
        Container.countDocuments({ ...containerFilter, status: { $in: ["HELD", "INACTIVE"] } }),
      ]);
      const relatedFilter = { container: { $in: containerIds } };

      const paymentFilter = { ...relatedFilter };
      if (paymentStatus) paymentFilter.status = paymentStatus;
      if (dateResult.range) {
        if (paymentStatus === "SUCCESS") {
          paymentFilter.paidAt = dateResult.range;
        } else if (paymentStatus) {
          paymentFilter.createdAt = dateResult.range;
        } else {
          paymentFilter.$or = [
            { status: "SUCCESS", paidAt: dateResult.range },
            { status: { $in: ["PENDING", "FAILED"] }, createdAt: dateResult.range },
          ];
        }
      }

      const inspectionFilter = { ...relatedFilter };
      if (inspectionResult) inspectionFilter.result = inspectionResult;
      if (dateResult.range) inspectionFilter.scheduledAt = dateResult.range;

      const eventFilter = { ...relatedFilter };
      if (dateResult.range) eventFilter.createdAt = dateResult.range;

      const [
        pendingDocumentReviews,
        paymentGroups,
        inspectionGroups,
        stageGroups,
        activityGroups,
        totalSuccessfulPayment,
        totalAssessedDuty,
      ] = await Promise.all([
        Document.countDocuments({ ...relatedFilter, reviewStatus: "PENDING" }),
        Payment.aggregate([
          { $match: paymentFilter },
          { $group: { _id: { status: "$status", provider: "$provider" }, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
        ]),
        Inspection.aggregate([
          { $match: inspectionFilter },
          { $group: { _id: "$result", count: { $sum: 1 } } },
        ]),
        Container.aggregate([
          { $match: containerFilter },
          { $group: { _id: "$currentStage", count: { $sum: 1 } } },
        ]),
        ClearanceEvent.aggregate([
          { $match: eventFilter },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: dateResult.range && dateResult.range.$gte && dateResult.range.$lte && (dateResult.range.$lte - dateResult.range.$gte) <= 60 * 86400000 ? "%Y-%m-%d" : "%Y-%m",
                  date: "$createdAt",
                  timezone: "UTC",
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Payment.aggregate([
          { $match: { ...paymentFilter, status: paymentStatus && paymentStatus !== "SUCCESS" ? "__NO_SUCCESS__" : "SUCCESS" } },
          { $group: { _id: null, amount: { $sum: "$amount" } } },
        ]),
        Container.aggregate([
          { $match: containerFilter },
          { $group: { _id: null, amount: { $sum: "$dutyAssessment.amount" } } },
        ]),
      ]);

      const paymentCounts = {};
      const paymentAmounts = {};
      const providerBreakdown = {};
      for (const group of paymentGroups) {
        const { status: paymentGroupStatus, provider } = group._id;
        paymentCounts[paymentGroupStatus] = (paymentCounts[paymentGroupStatus] || 0) + group.count;
        paymentAmounts[paymentGroupStatus] = (paymentAmounts[paymentGroupStatus] || 0) + group.amount;
        providerBreakdown[provider] = (providerBreakdown[provider] || 0) + group.count;
      }
      const inspectionCounts = Object.fromEntries(inspectionGroups.map((group) => [group._id, group.count]));
      const stageCounts = Object.fromEntries(stageGroups.map((group) => [group._id, group.count]));
      const activityByDate = Object.fromEntries(activityGroups.map((group) => [group._id, group.count]));

      return res.status(200).json({
        generatedAt: new Date(),
        limits: { containersReturned: containers.length, containerResultLimit: 200 },
        filters: { dateFrom: req.query.dateFrom || null, dateTo: req.query.dateTo || null, stage: stage || null, size: size || null, containerStatus: containerStatus || null, containerNumber: containerNumber || null, paymentStatus: paymentStatus || null, inspectionResult: inspectionResult || null },
        statistics: {
          totalContainers,
          containersInProgress: inProgressContainers,
          containersReleased: stageCounts.RELEASED || 0,
          containersCollected: stageCounts.COLLECTED || 0,
          containersHeldOrInactive: heldOrInactiveContainers,
          pendingDocumentReviews,
          pendingInspections: inspectionCounts.PENDING || 0,
          failedPayments: paymentCounts.FAILED || 0,
          successfulPayments: paymentCounts.SUCCESS || 0,
          pendingPayments: paymentCounts.PENDING || 0,
          assessedDutyAmount: totalAssessedDuty[0]?.amount || 0,
          successfullyPaidAmount: totalSuccessfulPayment[0]?.amount || 0,
          paymentAmounts,
          providerBreakdown,
          inspectionResults: inspectionCounts,
        },
        charts: {
          containersByStage: clearanceStages.map((label) => ({ label, value: stageCounts[label] || 0 })),
          clearanceActivity: Object.entries(activityByDate).map(([label, value]) => ({ label, value })),
        },
        containers,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
