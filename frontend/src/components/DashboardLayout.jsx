import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  FaAnchor,
  FaArrowUpRightFromSquare,
  FaBars,
  FaGaugeHigh,
  FaRightFromBracket,
  FaXmark,
} from "react-icons/fa6";
import useAuth from "../context/useAuth.js";

// Format backend role constants as readable labels for the dashboard header.
function formatRole(role) {
  const labels = {
    ADMIN: "Administrator",
    IMPORTER: "Importer",
    CLEARING_AGENT: "Clearing Agent",
    CUSTOMS_OFFICER: "Customs Officer",
  };

  return labels[role] || role;
}

// Provide the shared responsive sidebar and user header for dashboard pages.
function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Close the mobile sidebar when a dashboard link is selected.
  function closeSidebar() {
    setSidebarOpen(false);
  }

  // Clear the JWT session and return to the public website.
  function handleLogout() {
    signOut();
    closeSidebar();
    navigate("/", { replace: true });
  }

  const dashboardLink = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
      isActive
        ? "bg-white/10 text-white"
        : "text-blue-100/75 hover:bg-white/[0.07] hover:text-white"
    }`;

  const sidebar = (
    <>
      <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-blue-200">
          <FaAnchor />
        </span>
        <span className="text-sm font-extrabold tracking-tight text-white">
          Port Clearance
        </span>
      </div>
      <div className="flex-1 px-4 py-6">
        <p className="px-4 pb-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-200/60">
          Workspace
        </p>
        <NavLink
          to="/dashboard"
          end
          onClick={closeSidebar}
          className={dashboardLink}
        >
          <FaGaugeHigh className="text-base" /> Dashboard
        </NavLink>
      </div>
      <div className="space-y-2 border-t border-white/10 p-4">
        <Link
          to="/"
          onClick={closeSidebar}
          className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-blue-100/80 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          Visit Website <FaArrowUpRightFromSquare className="text-xs" />
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-rose-200 transition-colors hover:bg-rose-400/10 hover:text-white"
        >
          <FaRightFromBracket /> Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#172554] shadow-xl shadow-blue-950/10 lg:flex">
        {sidebar}
      </aside>

      {sidebarOpen && (
        <>
          <button
            type="button"
            onClick={closeSidebar}
            className="fixed inset-0 z-40 cursor-default bg-[#0b1738]/60 backdrop-blur-sm lg:hidden"
            aria-label="Close sidebar"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col bg-[#172554] shadow-2xl lg:hidden">
            {sidebar}
            <button
              type="button"
              onClick={closeSidebar}
              className="absolute right-3 top-4 flex size-10 items-center justify-center rounded-xl text-white hover:bg-white/10"
              aria-label="Close sidebar"
            >
              <FaXmark />
            </button>
          </aside>
        </>
      )}

      <div className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm shadow-slate-900/[0.03] backdrop-blur">
          <div className="flex min-h-[72px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-[#172554] transition hover:bg-blue-50 lg:hidden"
                aria-label="Open dashboard sidebar"
                aria-expanded={sidebarOpen}
              >
                <FaBars />
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-500">
                  Port Container Clearance Tracker
                </p>
                <h1 className="text-base font-extrabold text-[#172554] sm:text-lg">
                  Dashboard
                </h1>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-[#2B4593] sm:flex">
                {user?.fullName?.trim()?.charAt(0)?.toUpperCase() || "U"}
              </span>
              <div className="min-w-0 text-right">
                <p className="max-w-[45vw] truncate text-sm font-extrabold text-[#172554] sm:max-w-xs">
                  {user?.fullName}
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  {formatRole(user?.role)}
                </p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-7 lg:p-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
