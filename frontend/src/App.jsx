import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import PublicLayout from "./components/PublicLayout.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import BillOfLadingPage from "./pages/BillOfLadingPage.jsx";
import ContainersPage from "./pages/ContainersPage.jsx";
import DocumentsPage from "./pages/DocumentsPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PortsManagementPage from "./pages/PortsManagementPage.jsx";
import ShippingLinesPage from "./pages/ShippingLinesPage.jsx";
import TrackingPage from "./pages/TrackingPage.jsx";
import UsersManagementPage from "./pages/UsersManagementPage.jsx";

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
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
