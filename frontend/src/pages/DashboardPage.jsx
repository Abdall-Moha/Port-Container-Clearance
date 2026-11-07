import { FaAnchor, FaCircleCheck } from "react-icons/fa6";
import useAuth from "../context/useAuth.js";

// Welcome the authenticated user without showing placeholder operational data.
function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#172554] via-[#1e3471] to-[#2B4593] p-6 text-white shadow-lg shadow-blue-950/10 sm:p-9">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-200">Your workspace</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Welcome, {user?.fullName}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/85">
              You are signed in to the Port Container Clearance Tracker. Your dashboard is ready for the tools available to your role.
            </p>
          </div>
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl text-blue-100">
            <FaAnchor />
          </span>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.04] sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FaCircleCheck /></span>
          <div>
            <h2 className="font-extrabold text-[#172554]">Dashboard foundation is ready</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              This shared dashboard layout is prepared for future role-specific pages. No operational data is displayed until those pages are implemented.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
