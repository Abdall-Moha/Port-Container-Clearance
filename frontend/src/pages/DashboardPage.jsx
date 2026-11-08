import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaArrowRight,
  FaBoxesStacked,
  FaCalendarCheck,
  FaCheck,
  FaCircleExclamation,
  FaClock,
  FaCreditCard,
  FaFileCircleCheck,
  FaFileLines,
  FaGaugeHigh,
  FaLink,
  FaMagnifyingGlass,
  FaRotate,
  FaShip,
  FaTruck,
  FaUsers,
} from "react-icons/fa6";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

const stageLabels = {
  ARRIVED: "Arrived",
  DOCUMENTS_SUBMITTED: "Documents submitted",
  CUSTOMS_REVIEW: "Customs review",
  DUTY_ASSESSED: "Duty assessed",
  DUTY_PAID: "Duty paid",
  INSPECTION: "Inspection",
  RELEASED: "Released",
  COLLECTED: "Collected",
};

const roleGreetings = {
  ADMIN: "System operations at a glance.",
  IMPORTER: "Track your containers and the next steps in clearance.",
  CLEARING_AGENT: "Review your assigned work and collection responsibilities.",
  CUSTOMS_OFFICER: "Your document reviews, inspections, and release work.",
};

// Format a record date without inventing a fallback timestamp.
function formatDate(value, includeTime = false) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

// Show a consistent metric card for role-specific database statistics.
function MetricCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-50 text-[#2B4593]",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black tracking-tight text-[#172554]">{value ?? 0}</p></div><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}><Icon /></span></div>
    {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
  </article>;
}

// Display a reusable section heading and content card.
function Section({ title, description, action, children }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-extrabold text-[#172554]">{title}</h2>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>{action}</div>
    <div className="p-5 sm:p-6">{children}</div>
  </section>;
}

// Show a useful empty state when an authorized queue has no records.
function EmptyState({ children }) {
  return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

// Display the user's recent notifications without creating a second notification workflow.
function RecentNotifications({ data }) {
  const notifications = data?.notifications || [];
  return <Section title="Recent notifications" description={`${data?.unreadCount || 0} unread notification${data?.unreadCount === 1 ? "" : "s"}`} action={<Link to="/dashboard/notifications" className="inline-flex items-center gap-2 text-xs font-extrabold text-[#2B4593] hover:underline">All notifications <FaArrowRight /></Link>}>
    {notifications.length === 0 ? <EmptyState>You’re all caught up. New account updates will appear here.</EmptyState> : <div className="divide-y divide-slate-100">{notifications.map((item) => <article key={item._id} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className={`mt-1 size-2 shrink-0 rounded-full ${item.isRead ? "bg-slate-300" : "bg-blue-600"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-[#172554]">{item.title}</h3><time className="text-[11px] text-slate-400">{formatDate(item.createdAt, true)}</time></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.message}</p>{item.containerNumber && <p className="mt-1 text-[11px] font-semibold text-slate-500">Container {item.containerNumber}</p>}</div></article>)}</div>}
  </Section>;
}

// Show a compact list of recent operational events.
function RecentActivity({ items }) {
  return <Section title="Recent system activity" description="Latest recorded operational events">
    {items?.length ? <ol className="space-y-3">{items.map((item, index) => <li key={`${item.type}-${item.containerNumber}-${item.at}-${index}`} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#2B4593]" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-700">{item.label}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">{item.containerNumber && <span>Container {item.containerNumber}</span>}<time>{formatDate(item.at, true)}</time></div></div></li>)}</ol> : <EmptyState>No recent activity is recorded.</EmptyState>}
  </Section>;
}

// Show current container counts for all clearance stages as a responsive bar chart.
function StageChart({ stages }) {
  const maxCount = Math.max(1, ...(stages || []).map((item) => item.count));
  const hasContainers = (stages || []).some((item) => item.count > 0);
  return <Section title="Containers by clearance stage" description="Current stage counts; inactive containers are excluded.">
    {!hasContainers ? <EmptyState>No active workflow containers are recorded.</EmptyState> : <div className="space-y-3" role="img" aria-label="Horizontal bar chart of current container counts by clearance stage">
      <p className="text-[11px] font-semibold text-slate-400">Number of containers</p>
      {stages.map((item) => <div key={item.stage} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-xs sm:grid-cols-[10rem_1fr_2.5rem]">
        <span className="truncate font-semibold text-slate-600" title={stageLabels[item.stage] || item.stage}>{stageLabels[item.stage] || item.stage}</span>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100" title={`${stageLabels[item.stage] || item.stage}: ${item.count} containers`}><div className="h-full rounded-full bg-[#2B4593] transition-all" style={{ width: `${(item.count / maxCount) * 100}%` }} /></div>
        <b className="text-right text-[#172554]">{item.count}</b>
      </div>)}
      <div className="flex justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400"><span>0</span><span>{maxCount} containers</span></div>
    </div>}
  </Section>;
}

// Show recorded clearance stage transitions grouped by UTC calendar month.
function ClearanceActivityChart({ activity }) {
  const records = activity || [];
  const maxCount = Math.max(1, ...records.map((item) => item.count));
  const hasActivity = records.some((item) => item.count > 0);
  return <Section title="Clearance activity over time" description="Recorded stage transitions by month (UTC), for the past 12 months.">
    {!hasActivity ? <EmptyState>No clearance transitions were recorded in this period.</EmptyState> : <div role="img" aria-label="Column chart of recorded clearance transitions by month" className="overflow-x-auto">
      <p className="text-[11px] font-semibold text-slate-400">Number of stage transitions</p>
      <div className="mt-3 flex min-w-[560px] items-end gap-2 border-b border-l border-slate-200 px-2 pb-2 pt-2 sm:gap-3">
        {records.map((item) => {
          const monthLabel = new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${item.month}-01T00:00:00Z`));
          const barHeight = item.count === 0 ? 2 : Math.max(6, (item.count / maxCount) * 140);
          return <div key={item.month} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-1" title={`${monthLabel}: ${item.count} stage transitions`}>
            <span className="text-[10px] font-bold text-slate-500">{item.count}</span>
            <div className={`w-full max-w-10 rounded-t-md ${item.count ? "bg-emerald-600" : "bg-slate-200"}`} style={{ height: `${barHeight}px` }} />
            <span className="whitespace-nowrap text-[9px] font-semibold text-slate-500">{monthLabel}</span>
          </div>;
        })}
      </div>
      <p className="mt-2 text-right text-[10px] text-slate-400">Month (UTC)</p>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500"><span className="size-2.5 rounded-sm bg-emerald-600" />Recorded stage transitions</div>
    </div>}
  </Section>;
}

// Show actual clearance-event timestamps and never mark stages after the current stage complete.
function ClearanceTimeline({ timeline }) {
  return <div className="mt-4 overflow-x-auto pb-1"><ol className="flex min-w-[700px] items-start">{timeline?.map((item, index) => <li key={item.stage} className="relative flex flex-1 flex-col items-center text-center"><span className={`z-10 flex size-7 items-center justify-center rounded-full border-2 text-[10px] ${item.state === "COMPLETED" ? "border-emerald-600 bg-emerald-600 text-white" : item.state === "CURRENT" ? "border-[#2B4593] bg-blue-50 text-[#2B4593]" : "border-slate-200 bg-white text-slate-400"}`}>{item.state === "COMPLETED" ? <FaCheck /> : index + 1}</span>{index < timeline.length - 1 && <span className={`absolute left-1/2 top-3.5 h-0.5 w-full ${item.state === "COMPLETED" ? "bg-emerald-500" : "bg-slate-200"}`} />}<span className={`mt-2 max-w-20 text-[10px] font-bold leading-4 ${item.state === "CURRENT" ? "text-[#2B4593]" : "text-slate-500"}`}>{stageLabels[item.stage] || item.stage}</span>{item.state !== "UPCOMING" && item.completedAt && <time className="mt-1 text-[9px] text-slate-400">{formatDate(item.completedAt)}</time>}</li>)}</ol></div>;
}

// Display useful shortcuts only to the Admin role.
function AdminShortcuts() {
  const links = [
    ["Users", "/dashboard/users", FaUsers],
    ["Containers", "/dashboard/containers", FaBoxesStacked],
    ["Duty Rates", "/dashboard/duty-rates", FaCreditCard],
    ["Demurrage Rates", "/dashboard/demurrage-rates", FaShip],
    ["Webhooks", "/dashboard/webhooks", FaLink],
    ["Reports / Monitoring", "/dashboard/reports", FaGaugeHigh],
  ];
  return <Section title="Quick access" description="Open an Admin management workspace"><div className="grid gap-2 sm:grid-cols-2">{links.map(([label, to, Icon]) => <Link key={to} to={to} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2B4593]"><span className="flex items-center gap-3"><Icon />{label}</span><FaArrowRight className="text-xs" /></Link>)}</div></Section>;
}

// Show verified dashboard information that is scoped to the authenticated user's role.
function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [dashboardUserId, setDashboardUserId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const requestNumber = useRef(0);

  // Retrieve role-specific information from the authenticated dashboard endpoint.
  const loadDashboard = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    try {
      const response = await api.get("/dashboard");
      if (currentRequest === requestNumber.current) {
        setDashboard(response.data);
        setDashboardUserId(String(user?.id || ""));
        setErrorMessage("");
      }
    } catch (error) {
      if (currentRequest === requestNumber.current) {
        setErrorMessage(error.response?.data?.message || "Unable to load your dashboard. Please try again.");
      }
    } finally {
      if (currentRequest === requestNumber.current) {
        setIsRefreshing(false);
      }
    }
  }, [user]);

  // Reload when the signed-in user or role changes and ignore a superseded request.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestNumber.current += 1;
    };
  }, [loadDashboard]);

  // Refresh all dashboard information from the backend.
  function handleRefresh() {
    setIsRefreshing(true);
    void loadDashboard();
  }

  const role = user?.role;
  const isDashboardForCurrentUser = dashboardUserId === String(user?.id || "") && dashboard?.role === role;
  const currentDashboard = isDashboardForCurrentUser ? dashboard : null;
  const statistics = currentDashboard?.statistics || {};
  const heading = role === "ADMIN" ? "Operations overview" : role === "IMPORTER" ? "My clearance overview" : role === "CLEARING_AGENT" ? "My assigned work" : "Customs work overview";

  if (!currentDashboard && !errorMessage) return <div className="space-y-6"><div className="h-40 animate-pulse rounded-3xl bg-blue-950/90" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div><p role="status" className="text-center text-sm text-slate-500">Loading your dashboard…</p></div>;

  return <div className="space-y-6 sm:space-y-7">
    <header className="flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-br from-[#172554] via-[#1e3471] to-[#2B4593] p-6 text-white shadow-lg shadow-blue-950/10 sm:flex-row sm:items-center sm:p-8">
      <div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-200">{heading}</p><h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Welcome, {user?.fullName || "User"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/85">{roleGreetings[role] || "Your Port Container Clearance Tracker workspace."}</p></div>
      <button type="button" onClick={handleRefresh} disabled={isRefreshing} className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-50 sm:self-auto"><FaRotate className={isRefreshing ? "animate-spin" : ""} /> Refresh</button>
    </header>

    {errorMessage && <div role="alert" className="flex flex-col justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 sm:flex-row sm:items-center"><span>{errorMessage}</span>{dashboard && <button type="button" onClick={handleRefresh} className="font-extrabold underline">Retry</button>}</div>}
    {isRefreshing && <p role="status" className="text-xs font-semibold text-slate-500">Updating dashboard…</p>}

    {role === "ADMIN" && <AdminDashboard data={currentDashboard} statistics={statistics} />}
    {role === "IMPORTER" && <ImporterDashboard data={currentDashboard} statistics={statistics} />}
    {role === "CLEARING_AGENT" && <AgentDashboard data={currentDashboard} statistics={statistics} />}
    {role === "CUSTOMS_OFFICER" && <CustomsDashboard data={currentDashboard} statistics={statistics} />}
    <RecentNotifications data={currentDashboard?.notifications} />
  </div>;
}

// Render Admin-wide metrics, alerts, stage counts, activity, and shortcuts.
function AdminDashboard({ data, statistics }) {
  const metricCards = [
    ["Total containers", statistics.totalContainers, "All registered clearances", FaBoxesStacked, "blue"],
    ["In progress", statistics.containersInProgress, "Active clearances", FaClock, "amber"],
    ["Released", statistics.containersReleased, "Current stage", FaFileCircleCheck, "green"],
    ["Collected", statistics.containersCollected, "Collection confirmed", FaTruck, "green"],
    ["Held / inactive", statistics.containersHeldOrInactive, "Container status", FaCircleExclamation, "rose"],
    ["Users", statistics.totalUsers, `${statistics.activeUsers || 0} active`, FaUsers, "blue"],
    ["Pending reviews", statistics.pendingDocumentReviews, "Document records", FaFileLines, "amber"],
    ["Pending inspections", statistics.pendingInspections, "Inspection records", FaMagnifyingGlass, "amber"],
    ["Failed payments", statistics.failedPayments, "Stored failed status", FaCreditCard, "rose"],
  ];
  const alertCards = [
    ["Failed webhooks", data?.alerts?.failedWebhooks?.count || 0, (data?.alerts?.failedWebhooks?.items || []).map((item) => `${item.containerNumber || item.eventId} · ${item.errorMessage || "Delivery failed"}`), "rose"],
    ["Containers held after failed inspection", data?.alerts?.heldAfterFailedInspection?.count || 0, (data?.alerts?.heldAfterFailedInspection?.items || []).map((item) => item.containerNumber), "amber"],
    ["Missing active duty rates", data?.alerts?.missingDutyRates?.count || 0, (data?.alerts?.missingDutyRates?.chapters || []).map((chapter) => `HS Chapter ${chapter}`), "amber"],
    ["Missing demurrage rates", data?.alerts?.missingDemurrageRates?.count || 0, data?.alerts?.missingDemurrageRates?.sizes || [], "amber"],
  ];
  return <div className="space-y-6">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metricCards.map(([label, value, detail, icon, tone]) => <MetricCard key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} />)}</section>
    <div className="grid gap-5 xl:grid-cols-2"><StageChart stages={statistics.containersByStage || []} /><ClearanceActivityChart activity={statistics.clearanceActivityByMonth || []} /></div>
    <RecentActivity items={data?.recentActivity} />
    <Section title="Operational alerts" description="Items that can be identified from current workflow data"><div className="grid gap-3 md:grid-cols-2">{alertCards.map(([title, count, items, tone]) => <article key={title} className={`rounded-xl border p-4 ${count ? tone === "rose" ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60" : "border-slate-100 bg-slate-50"}`}><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold text-[#172554]">{title}</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700">{count}</span></div>{count === 0 ? <p className="mt-2 text-xs text-slate-500">No current items.</p> : <ul className="mt-3 space-y-1 text-xs text-slate-600">{items.slice(0, 4).map((item, index) => <li className="break-words" key={`${title}-${index}`}>• {item}</li>)}</ul>}</article>)}</div></Section>
    <div className="grid gap-5 xl:grid-cols-2"><Section title="Recently registered containers" description="Latest registrations across the system" action={<Link to="/dashboard/containers" className="text-xs font-extrabold text-[#2B4593] hover:underline">All containers</Link>}>{data?.recentContainers?.length ? <div className="space-y-3">{data.recentContainers.map((item) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3" key={item._id}><div><p className="font-extrabold text-[#172554]">{item.containerNumber}</p><p className="mt-1 text-xs text-slate-500">{item.importer?.fullName || "Importer unavailable"} · {item.size} · {item.status}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{stageLabels[item.currentStage] || item.currentStage}</span></div>)}</div> : <EmptyState>No containers have been registered.</EmptyState>}</Section><AdminShortcuts /></div>
  </div>;
}

// Render only the authenticated Importer's containers, documents, payments, and progress.
function ImporterDashboard({ data, statistics }) {
  const metrics = [
    ["My containers", statistics.totalContainers, "All my registrations", FaBoxesStacked, "blue"],
    ["In progress", statistics.containersInProgress, "Active clearances", FaClock, "amber"],
    ["Released", statistics.containersReleased, "Awaiting collection where applicable", FaFileCircleCheck, "green"],
    ["Collected", statistics.containersCollected, "Confirmed collection", FaTruck, "green"],
    ["Need my attention", statistics.requiringAttention, "Documents or payment need action", FaCircleExclamation, "rose"],
  ];
  return <div className="space-y-6"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([label, value, detail, icon, tone]) => <MetricCard key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} />)}</section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Documents awaiting review", statistics.documentsAwaitingReview, "blue"], ["Rejected documents", statistics.rejectedDocuments, "rose"], ["Approved documents", statistics.approvedDocuments, "green"], ["Pending payments", statistics.paymentsPending, "amber"], ["Successful / failed payments", `${statistics.paymentsSuccessful || 0} / ${statistics.paymentsFailed || 0}`, "slate"]].map(([label, value, tone]) => <MetricCard key={label} label={label} value={value} icon={label.includes("payment") || label.includes("payments") ? FaCreditCard : FaFileLines} tone={tone} />)}</section>
    <Section title="My clearance progress" description="Completed steps use recorded clearance event times. Future steps remain pending." action={<Link to="/dashboard/containers" className="text-xs font-extrabold text-[#2B4593] hover:underline">View containers</Link>}>{data?.containers?.length ? <div className="divide-y divide-slate-100">{data.containers.map((container) => <article className="py-4 first:pt-0 last:pb-0" key={container._id}><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-extrabold text-[#172554]">{container.containerNumber}</h3><p className="mt-1 text-xs text-slate-500">{container.size} · {stageLabels[container.currentStage] || container.currentStage} · Arrived {formatDate(container.arrivalDate)}</p></div><Link to={`/dashboard/containers?container=${container._id}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#2B4593] hover:bg-blue-50">Details <FaArrowRight /></Link></div><ClearanceTimeline timeline={container.timeline} /></article>)}</div> : <EmptyState>You do not have any containers yet.</EmptyState>}</Section>
    <div className="flex flex-wrap gap-3"><Link to="/dashboard/documents" className="rounded-xl bg-[#2B4593] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#21377a]">Open Documents</Link><Link to="/dashboard/payments" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-[#2B4593] hover:bg-blue-50">Open Payments</Link></div>
  </div>;
}

// Render only containers assigned to the authenticated Clearing Agent.
function AgentDashboard({ data, statistics }) {
  const metrics = [
    ["Assigned containers", statistics.totalAssignedContainers, "All assigned records", FaBoxesStacked, "blue"],
    ["In progress", statistics.assignedInProgress, "Active clearance", FaClock, "amber"],
    ["Documents / corrections", statistics.awaitingDocumentsOrCorrection, "Submission or rejected document", FaFileLines, "rose"],
    ["Awaiting payment", statistics.awaitingPayment, "Duty assessed", FaCreditCard, "amber"],
    ["Inspection / release", statistics.awaitingInspectionOrRelease, "Duty paid or inspection stage", FaMagnifyingGlass, "blue"],
    ["Released", statistics.released, "Current clearance stage", FaFileCircleCheck, "green"],
    ["Awaiting collection", statistics.awaitingCollection, "Issued order, unused code", FaTruck, "amber"],
  ];
  return <div className="space-y-6"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, detail, icon, tone]) => <MetricCard key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} />)}</section>
    <div className="grid gap-5 xl:grid-cols-2"><Section title="Assigned containers" description="Recent containers assigned to your account" action={<Link to="/dashboard/containers" className="text-xs font-extrabold text-[#2B4593] hover:underline">All assigned</Link>}>{data?.containers?.length ? <div className="space-y-3">{data.containers.map((item) => <article key={item._id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-extrabold text-[#172554]">{item.containerNumber}</h3><p className="mt-1 text-xs text-slate-500">Importer: {item.importer?.fullName || "Unavailable"} · {item.size} · {formatDate(item.arrivalDate)}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2B4593]">{stageLabels[item.currentStage] || item.currentStage}</span></div></article>)}</div> : <EmptyState>No containers are assigned to your account.</EmptyState>}</Section>
      <div className="space-y-5"><Section title="Collection overview" description="Eligible orders only; Gate Codes are never shown here">{data?.collectionEligible?.length ? <div className="space-y-2">{data.collectionEligible.map((item) => <div key={item._id} className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-3"><div><p className="font-extrabold text-emerald-900">{item.containerNumber}</p><p className="text-xs text-emerald-800">{item.size} · Ready for collection</p></div><FaCheck className="text-emerald-700" /></div>)}</div> : <EmptyState>No containers are awaiting collection.</EmptyState>}<Link to="/dashboard/collection" className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-[#2B4593] hover:underline">Open secure collection page <FaArrowRight /></Link></Section>
        <Section title="Recently collected" description="Confirmed collection events">{data?.recentlyCollected?.length ? <ul className="space-y-3">{data.recentlyCollected.map((item, index) => <li key={`${item.containerNumber}-${item.collectedAt}-${index}`} className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-700">{item.containerNumber || "Container unavailable"}</span><time className="text-xs text-slate-500">{formatDate(item.collectedAt, true)}</time></li>)}</ul> : <EmptyState>No recent collection records.</EmptyState>}</Section></div></div>
    <div className="flex flex-wrap gap-3"><Link to="/dashboard/documents" className="rounded-xl bg-[#2B4593] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#21377a]">Review document tasks</Link><Link to="/dashboard/payments" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-[#2B4593] hover:bg-blue-50">Payments</Link></div>
  </div>;
}

// Render Customs Officer review, inspection, assessment, and release responsibilities.
function CustomsDashboard({ data, statistics }) {
  const metrics = [
    ["Awaiting document review", statistics.awaitingDocumentReview, "Submitted container queue", FaFileLines, "amber"],
    ["Active customs reviews", statistics.activeCustomsReviews, "Current Customs Review stage", FaClock, "blue"],
    ["Ready for duty assessment", statistics.readyForDutyAssessment, "All latest required documents approved", FaCreditCard, "green"],
    ["Awaiting inspection", statistics.awaitingInspection, "Duty paid; scheduling may be needed", FaMagnifyingGlass, "amber"],
    ["Scheduled inspections", statistics.scheduledInspections, "Pending results", FaCalendarCheck, "blue"],
    ["Completed inspections", statistics.completedInspections, "Passed or failed attempts", FaCheck, "green"],
    ["Passed inspections", statistics.passedInspections, "Recorded PASS results", FaCheck, "green"],
    ["Failed inspections", statistics.failedInspections, "Recorded FAIL results", FaCircleExclamation, "rose"],
    ["Held after failed inspection", statistics.heldAfterFailedInspection, "Reinspection workflow", FaCircleExclamation, "rose"],
    ["Eligible for Release Order", statistics.eligibleForReleaseOrder, "Latest inspection passed", FaFileCircleCheck, "green"],
  ];
  return <div className="space-y-6"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, detail, icon, tone]) => <MetricCard key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} />)}</section>
    <div className="grid gap-5 xl:grid-cols-2"><Section title="Document review queue" description="Submitted containers awaiting Customs review" action={<Link to="/dashboard/documents" className="text-xs font-extrabold text-[#2B4593] hover:underline">Open Documents</Link>}>{data?.documentReviewQueue?.length ? <div className="space-y-3">{data.documentReviewQueue.map((item) => <article key={item._id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-extrabold text-[#172554]">{item.containerNumber}</h3><p className="mt-1 text-xs text-slate-500">{item.importer?.fullName || "Importer unavailable"} · {item.requiredDocumentCount} of 4 required records found</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{item.pendingReviewCount} pending · {item.rejectedCount} rejected</span></div><p className="mt-2 text-xs text-slate-500">Latest upload: {formatDate(item.submittedAt, true)}</p></article>)}</div> : <EmptyState>No containers are waiting for document review.</EmptyState>}</Section>
      <Section title="Inspection overview" description="Scheduled attempts and containers waiting for inspection" action={<Link to="/dashboard/inspections" className="text-xs font-extrabold text-[#2B4593] hover:underline">Open Inspections</Link>}><div className="space-y-4"><div><h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Upcoming / pending inspections</h3>{data?.inspectionQueue?.length ? <ul className="space-y-2">{data.inspectionQueue.map((item) => <li key={item._id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-3 py-3"><div><p className="font-bold text-[#172554]">{item.containerNumber}</p><p className="mt-1 text-xs text-slate-500">{item.importerName} · {item.inspectorName}</p></div><time className="text-xs text-slate-500">{formatDate(item.scheduledAt, true)}</time></li>)}</ul> : <EmptyState>No inspections are awaiting a result.</EmptyState>}</div><div><h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Containers awaiting inspection scheduling</h3>{data?.awaitingInspection?.length ? <ul className="space-y-2">{data.awaitingInspection.slice(0, 5).map((item) => <li key={item._id} className="rounded-lg border border-slate-100 px-3 py-3 text-sm"><b className="text-[#172554]">{item.containerNumber}</b><span className="ml-2 text-xs text-slate-500">{item.importer?.fullName || "Importer unavailable"}</span></li>)}</ul> : <p className="text-xs text-slate-500">No containers are waiting for initial inspection.</p>}</div></div></Section></div>
    <Section title="Containers requiring reinspection" description="Held containers in the inspection stage" action={<Link to="/dashboard/inspections" className="text-xs font-extrabold text-[#2B4593] hover:underline">Open Inspections</Link>}>{data?.heldContainers?.length ? <ul className="grid gap-2 sm:grid-cols-2">{data.heldContainers.map((item) => <li key={item._id} className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3"><p className="font-extrabold text-[#172554]">{item.containerNumber}</p><p className="mt-1 text-xs text-slate-600">{item.importer?.fullName || "Importer unavailable"} · on hold</p></li>)}</ul> : <EmptyState>No containers are currently held for reinspection.</EmptyState>}</Section>
    <div className="grid gap-5 xl:grid-cols-2"><Section title="Eligible Release Orders" description="Latest inspection passed and no active issued order exists" action={<Link to="/dashboard/release-orders" className="text-xs font-extrabold text-[#2B4593] hover:underline">Release Orders</Link>}>{data?.eligibleReleaseOrders?.length ? <ul className="space-y-2">{data.eligibleReleaseOrders.map((item) => <li key={item._id} className="flex justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3"><span className="font-extrabold text-emerald-900">{item.containerNumber}</span><span className="text-xs font-bold text-emerald-800">{item.isReplacement ? "Replacement" : "Ready to issue"}</span></li>)}</ul> : <EmptyState>No containers are eligible for a new or replacement Release Order.</EmptyState>}</Section><Section title="Recently issued Release Orders" description="Issued orders only; Gate Codes are not included">{data?.recentReleaseOrders?.length ? <ul className="space-y-3">{data.recentReleaseOrders.map((item) => <li key={item._id} className="flex flex-wrap justify-between gap-2"><div><p className="font-bold text-[#172554]">{item.releaseOrderNumber}</p><p className="mt-1 text-xs text-slate-500">Container {item.containerNumber}</p></div><time className="text-xs text-slate-500">{formatDate(item.issuedAt, true)}</time></li>)}</ul> : <EmptyState>No issued Release Orders are recorded.</EmptyState>}</Section></div>
  </div>;
}

export default DashboardPage;
