import {
  FaBell,
  FaBoxesStacked,
  FaCalculator,
  FaChartLine,
  FaCreditCard,
  FaFileCircleCheck,
  FaFileLines,
  FaGaugeHigh,
  FaLink,
  FaLocationDot,
  FaMagnifyingGlass,
  FaShip,
  FaTruck,
  FaUnlock,
  FaUser,
  FaUsers,
} from "react-icons/fa6";

const roleNavigation = {
  ADMIN: [
    { label: "Dashboard", to: "/dashboard", icon: FaGaugeHigh, available: true },
    { label: "Users", to: "/dashboard/users", icon: FaUsers, available: true },
    { label: "Ports", to: "/dashboard/ports", icon: FaLocationDot, available: true },
    { label: "Shipping Lines", to: "/dashboard/shipping-lines", icon: FaShip, available: true },
    { label: "Duty Rates", to: "/dashboard/duty-rates", icon: FaCalculator, available: true },
    { label: "Bill of Lading", to: "/dashboard/bills-of-lading", icon: FaFileLines, available: true },
    { label: "Containers", to: "/dashboard/containers", icon: FaBoxesStacked, available: true },
    { label: "Documents", to: "/dashboard/documents", icon: FaFileLines, available: true },
    { label: "Release Orders", to: "/dashboard/release-orders", icon: FaUnlock, available: true },
    { label: "Webhooks", icon: FaLink },
    { label: "Reports / Monitoring", icon: FaChartLine },
    { label: "Notifications", icon: FaBell },
    { label: "Profile", icon: FaUser },
  ],
  IMPORTER: [
    { label: "Dashboard", to: "/dashboard", icon: FaGaugeHigh, available: true },
    { label: "Containers", to: "/dashboard/containers", icon: FaBoxesStacked, available: true },
    { label: "Register Container", to: "/dashboard/containers", icon: FaTruck, available: true },
    { label: "Bill of Lading", to: "/dashboard/bills-of-lading", icon: FaFileLines, available: true },
    { label: "Documents", to: "/dashboard/documents", icon: FaFileLines, available: true },
    { label: "Payments", to: "/dashboard/payments", icon: FaCreditCard, available: true },
    { label: "Release Orders", to: "/dashboard/release-orders", icon: FaUnlock, available: true },
    { label: "Notifications", icon: FaBell },
    { label: "Profile", icon: FaUser },
  ],
  CLEARING_AGENT: [
    { label: "Dashboard", to: "/dashboard", icon: FaGaugeHigh, available: true },
    { label: "Assigned Containers", to: "/dashboard/containers", icon: FaBoxesStacked, available: true },
    { label: "Bill of Lading", to: "/dashboard/bills-of-lading", icon: FaFileLines, available: true },
    { label: "Documents", to: "/dashboard/documents", icon: FaFileCircleCheck, available: true },
    { label: "Payments", to: "/dashboard/payments", icon: FaCreditCard, available: true },
    { label: "Collection", icon: FaUnlock },
    { label: "Release Orders", to: "/dashboard/release-orders", icon: FaFileLines, available: true },
    { label: "Notifications", icon: FaBell },
    { label: "Profile", icon: FaUser },
  ],
  CUSTOMS_OFFICER: [
    { label: "Dashboard", to: "/dashboard", icon: FaGaugeHigh, available: true },
    { label: "Containers", to: "/dashboard/containers", icon: FaBoxesStacked, available: true },
    { label: "Document Reviews", to: "/dashboard/documents", icon: FaFileCircleCheck, available: true },
    { label: "Bill of Lading", to: "/dashboard/bills-of-lading", icon: FaFileLines, available: true },
    { label: "Duty Assessments", to: "/dashboard/duty-assessments", icon: FaCalculator, available: true },
    { label: "Inspections", to: "/dashboard/inspections", icon: FaMagnifyingGlass, available: true },
    { label: "Release Orders", to: "/dashboard/release-orders", icon: FaUnlock, available: true },
    { label: "Notifications", icon: FaBell },
    { label: "Profile", icon: FaUser },
  ],
};

// Return only navigation items configured for the authenticated user's role.
export function getDashboardNavigation(role) {
  return roleNavigation[role] || [];
}
