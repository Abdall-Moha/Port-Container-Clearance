import { useCallback, useEffect, useState } from "react";
import { FaChartColumn, FaChartLine, FaRotate } from "react-icons/fa6";
import api from "../config/api.js";

const initialFilters = { dateFrom: "", dateTo: "", stage: "", size: "", containerStatus: "", containerNumber: "", paymentStatus: "", inspectionResult: "" };

// Format stored payment and assessment amounts without applying currency conversion.
function formatUsd(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

// Format timestamps that came from saved records.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

// Display filtered operational monitoring and analytics from the Admin reports API.
function ReportsMonitoringPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Retrieve report statistics and real chart datasets for the selected filters.
  const loadReport = useCallback(async (selectedFilters) => {
    try {
      const params = Object.fromEntries(Object.entries(selectedFilters).filter(([, value]) => value));
      const response = await api.get("/reports/overview", { params });
      setReport(response.data);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to load reports. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load the initial unfiltered report when an Admin opens the page.
  useEffect(() => {
    const requestId = window.setTimeout(() => void loadReport(initialFilters), 0);
    return () => window.clearTimeout(requestId);
  }, [loadReport]);

  const visibleContainers = report?.containers || [];
  const stats = report?.statistics || {};
  const stageChart = report?.charts?.containersByStage || [];
  const activityChart = report?.charts?.clearanceActivity || [];
  const maxStageValue = Math.max(1, ...stageChart.map((item) => item.value));
  const maxActivityValue = Math.max(1, ...activityChart.map((item) => item.value));

  // Apply the selected filters together so every report section reflects one query.
  function handleApply(event) {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setIsLoading(true);
    void loadReport(filters);
  }

  // Refresh using the currently applied filter values.
  function handleRefresh() {
    setIsRefreshing(true);
    void loadReport(appliedFilters);
  }

  const kpis = [
    ["Total containers", stats.totalContainers, "All matching records"],
    ["In progress", stats.containersInProgress, "Active clearance"],
    ["Released", stats.containersReleased, "Current stage"],
    ["Collected", stats.containersCollected, "Current stage"],
    ["Held / inactive", stats.containersHeldOrInactive, "Container status"],
    ["Pending document reviews", stats.pendingDocumentReviews, "Unapproved document records"],
    ["Pending inspections", stats.pendingInspections, "Scheduled inspection records"],
    ["Failed payments", stats.failedPayments, "Stored payment status"],
  ];

  return <div className="space-y-7">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">Operations</p><h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">Reports / Monitoring</h1><p className="mt-2 text-sm text-slate-600">Operational indicators and clearance activity from saved system records.</p></div><button type="button" onClick={handleRefresh} disabled={isRefreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FaRotate className={isRefreshing ? "animate-spin" : ""} /> Refresh</button></header>

    <form onSubmit={handleApply} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9 xl:items-end"><label className="text-xs font-bold text-slate-600">From date<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label><label className="text-xs font-bold text-slate-600">To date<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label><label className="text-xs font-bold text-slate-600">Clearance stage<select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">All stages</option>{["ARRIVED", "DOCUMENTS_SUBMITTED", "CUSTOMS_REVIEW", "DUTY_ASSESSED", "DUTY_PAID", "INSPECTION", "RELEASED", "COLLECTED"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Container size<select value={filters.size} onChange={(event) => setFilters({ ...filters, size: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">All sizes</option><option>20FT</option><option>40FT</option></select></label><label className="text-xs font-bold text-slate-600">Container status<select value={filters.containerStatus} onChange={(event) => setFilters({ ...filters, containerStatus: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">All statuses</option>{["ACTIVE", "HELD", "COMPLETED", "INACTIVE"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Payment status<select value={filters.paymentStatus} onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">All statuses</option><option>PENDING</option><option>SUCCESS</option><option>FAILED</option></select></label><label className="text-xs font-bold text-slate-600">Inspection result<select value={filters.inspectionResult} onChange={(event) => setFilters({ ...filters, inspectionResult: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">All results</option><option>PENDING</option><option>PASS</option><option>FAIL</option></select></label><label className="text-xs font-bold text-slate-600">Container number<input value={filters.containerNumber} onChange={(event) => setFilters({ ...filters, containerNumber: event.target.value })} placeholder="Search number" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label><button type="submit" disabled={isLoading} className="rounded-lg bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#21377a] disabled:opacity-50">Apply filters</button></form>

    {errorMessage && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{errorMessage}</p>}
    {isLoading && !report ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading reports…</div> : report && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(([label, value, detail]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black tracking-tight text-[#172554]">{value ?? 0}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></article>)}</section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#2B4593]"><FaChartColumn /></span><div><h2 className="font-extrabold text-[#172554]">Containers by clearance stage</h2><p className="text-xs text-slate-500">Current saved stage for matching containers</p></div></div><div className="mt-5 space-y-3">{stageChart.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No container records match these filters.</p> : stageChart.map((item) => <div key={item.label} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-xs"><span className="truncate font-semibold text-slate-600" title={item.label}>{item.label.replaceAll("_", " ")}</span><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2B4593] transition-all" style={{ width: `${(item.value / maxStageValue) * 100}%` }} /></div><span className="text-right font-black text-[#172554]">{item.value}</span></div>)}</div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FaChartLine /></span><div><h2 className="font-extrabold text-[#172554]">Clearance activity over time</h2><p className="text-xs text-slate-500">Recorded ClearanceEvent timestamps (UTC)</p></div></div><div className="mt-5 flex min-h-48 items-end gap-2 overflow-x-auto border-b border-slate-100 pb-2">{activityChart.length === 0 ? <p className="m-auto py-8 text-center text-sm text-slate-500">No clearance events match these filters.</p> : activityChart.map((item) => <div key={item.label} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-bold text-slate-500">{item.value}</span><div title={`${item.label}: ${item.value} events`} className="w-full max-w-12 rounded-t-md bg-emerald-500" style={{ height: `${Math.max(5, (item.value / maxActivityValue) * 135)}px` }} /><span className="whitespace-nowrap text-[9px] font-semibold text-slate-500">{item.label}</span></div>)}</div></article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3"><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-[#172554]">Payment and duty</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Successful payments</span><b>{stats.successfulPayments || 0}</b></div><div className="flex justify-between"><span className="text-slate-500">Pending payments</span><b>{stats.pendingPayments || 0}</b></div><div className="flex justify-between"><span className="text-slate-500">Failed payments</span><b>{stats.failedPayments || 0}</b></div><div className="border-t border-slate-100 pt-3"><div className="flex justify-between"><span className="text-slate-500">Saved assessed duty</span><b>{formatUsd(stats.assessedDutyAmount)}</b></div><div className="mt-2 flex justify-between"><span className="text-slate-500">Successfully paid</span><b>{formatUsd(stats.successfullyPaidAmount)}</b></div></div></div><h3 className="mt-4 text-xs font-extrabold uppercase tracking-wide text-slate-500">Payments by provider</h3><div className="mt-2 flex flex-wrap gap-2">{Object.entries(stats.providerBreakdown || {}).length ? Object.entries(stats.providerBreakdown).map(([provider, count]) => <span key={provider} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2B4593]">{provider.replaceAll("_", " ")}: {count}</span>) : <span className="text-xs text-slate-400">No matching payments</span>}</div></article><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"><h2 className="font-extrabold text-[#172554]">Inspection results</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{["PENDING", "PASS", "FAIL"].map((result) => <div key={result} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">{result}</p><p className="mt-1 text-2xl font-black text-[#172554]">{stats.inspectionResults?.[result] || 0}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">Inspection figures use actual inspection records. A failed inspection does not by itself imply the container is currently held.</p></article></section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="p-5"><h2 className="font-extrabold text-[#172554]">Container clearance monitoring</h2><p className="mt-1 text-xs text-slate-500">Latest 200 matching containers; KPI and chart totals include all matches.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Container</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Size / status</th><th className="px-4 py-3">Importer</th><th className="px-4 py-3">Clearing agent</th><th className="px-4 py-3">Arrival date</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleContainers.length ? visibleContainers.map((container) => <tr key={container._id}><td className="px-4 py-3 font-extrabold text-[#172554]">{container.containerNumber}</td><td className="px-4 py-3 text-xs font-bold text-slate-600">{container.currentStage?.replaceAll("_", " ")}</td><td className="px-4 py-3"><span>{container.size}</span><span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{container.status}</span></td><td className="px-4 py-3">{container.importer?.fullName || "—"}</td><td className="px-4 py-3">{container.assignedAgent?.fullName || "—"}</td><td className="px-4 py-3 text-slate-600">{formatDate(container.arrivalDate)}</td></tr>) : <tr><td colSpan="6" className="px-4 py-12 text-center text-sm text-slate-500">No matching containers to display.</td></tr>}</tbody></table></div>{report.limits?.containersReturned >= report.limits?.containerResultLimit && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Showing the newest 200 matching records. Narrow the filters to inspect older records.</p>}</section>
    </>}
  </div>;
}

export default ReportsMonitoringPage;
