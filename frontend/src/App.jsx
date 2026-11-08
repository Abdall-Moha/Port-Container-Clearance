import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import PublicLayout from "./components/PublicLayout.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import BillOfLadingPage from "./pages/BillOfLadingPage.jsx";
import ContainersPage from "./pages/ContainersPage.jsx";
import DocumentsPage from "./pages/DocumentsPage.jsx";
import DutyRatesManagementPage from "./pages/DutyRatesManagementPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PortsManagementPage from "./pages/PortsManagementPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import ShippingLinesPage from "./pages/ShippingLinesPage.jsx";
import TrackingPage from "./pages/TrackingPage.jsx";
import UsersManagementPage from "./pages/UsersManagementPage.jsx";
import DutyAssessmentsPage from "./pages/DutyAssessmentsPage.jsx";
import InspectionsPage from "./pages/InspectionsPage.jsx";
import ReleaseOrdersPage from "./pages/ReleaseOrdersPage.jsx";

// Configure public routes and protect the shared dashboard shell.
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/track" element={<TrackingPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="containers" element={<ContainersPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route element={<ProtectedRoute allowedRoles={["ADMIN", "IMPORTER", "CLEARING_AGENT", "CUSTOMS_OFFICER"]} />}>
              <Route path="bills-of-lading" element={<BillOfLadingPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
              <Route path="users" element={<UsersManagementPage />} />
              <Route path="ports" element={<PortsManagementPage />} />
              <Route path="shipping-lines" element={<ShippingLinesPage />} />
              <Route path="duty-rates" element={<DutyRatesManagementPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={["IMPORTER", "CLEARING_AGENT"]} />}>
              <Route path="payments" element={<PaymentsPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={["CUSTOMS_OFFICER"]} />}>
              <Route path="duty-assessments" element={<DutyAssessmentsPage />} />
              <Route path="inspections" element={<InspectionsPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={["ADMIN", "IMPORTER", "CLEARING_AGENT", "CUSTOMS_OFFICER"]} />}>
              <Route path="release-orders" element={<ReleaseOrdersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
