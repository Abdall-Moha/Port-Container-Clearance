import { useCallback, useEffect, useMemo, useState } from "react";
import { FaBan, FaDownload, FaFileCircleCheck, FaMagnifyingGlass, FaRotate, FaUnlock, FaXmark } from "react-icons/fa6";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

// Format dates returned by the Release Order and inspection APIs.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// Load role-scoped container and Release Order records from existing APIs.
async function loadReleaseOrderWorkspace() {
  const [containersResponse, ordersResponse] = await Promise.all([
    api.get("/containers"),
    api.get("/release-orders"),
  ]);
  let portNamesById = {};
  try {
    const portsResponse = await api.get("/ports");
    portNamesById = Object.fromEntries((portsResponse.data?.ports || []).map((port) => [String(port._id), port.name]));
  } catch {
    // Port names improve labels but do not control release authorization.
  }

  const containers = containersResponse.data?.containers || [];
  const releaseOrders = ordersResponse.data?.releaseOrders || [];
  const orderContainerIds = new Set(releaseOrders.map((order) => String(order.container?._id || order.container)));
  const eligibleStageContainers = containers.filter((container) =>
    container.currentStage === "INSPECTION" && container.status === "ACTIVE" && !orderContainerIds.has(String(container._id)),
  );
  const inspectionsResult = await Promise.allSettled(eligibleStageContainers.map(async (container) => {
    const response = await api.get(`/inspections/container/${container._id}`);
    return [container._id, response.data?.inspections || []];
  }));
  const inspectionsByContainer = {};
  let hasInspectionErrors = false;
  inspectionsResult.forEach((result) => {
    if (result.status === "fulfilled") inspectionsByContainer[result.value[0]] = result.value[1];
    else hasInspectionErrors = true;
  });

  const paymentsResult = await Promise.allSettled(eligibleStageContainers.map(async (container) => {
    const response = await api.get(`/payments/container/${container._id}`);
    return [container._id, response.data?.payments || []];
  }));
  const paymentsByContainer = {};
  let hasPaymentErrors = false;
  paymentsResult.forEach((result) => {
    if (result.status === "fulfilled") paymentsByContainer[result.value[0]] = result.value[1];
    else hasPaymentErrors = true;
  });

  return { containers, releaseOrders, inspectionsByContainer, paymentsByContainer, portNamesById, hasInspectionErrors, hasPaymentErrors };
}

// Display authorized Release Orders and Customs Officer release candidates.
function ReleaseOrdersPage() {
  const { user } = useAuth();
  const [containers, setContainers] = useState([]);
  const [releaseOrders, setReleaseOrders] = useState([]);
  const [inspectionsByContainer, setInspectionsByContainer] = useState({});
  const [paymentsByContainer, setPaymentsByContainer] = useState({});
  const [portNamesById, setPortNamesById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [generatingId, setGeneratingId] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Refresh role-scoped release data and candidate eligibility records.
  const refresh = useCallback(async () => {
    try {
      setLoadingError("");
      const data = await loadReleaseOrderWorkspace();
      setContainers(data.containers);
      setReleaseOrders(data.releaseOrders);
      setInspectionsByContainer(data.inspectionsByContainer);
      setPaymentsByContainer(data.paymentsByContainer);
      setPortNamesById(data.portNamesById);
      if (data.hasInspectionErrors || data.hasPaymentErrors) setLoadingError("Some eligibility details could not be verified. Refresh to try again.");
    } catch (error) {
      setLoadingError(error.response?.data?.message || "Unable to load Release Orders.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadReleaseOrderWorkspace()
      .then((data) => {
        if (!isMounted) return;
        setContainers(data.containers);
        setReleaseOrders(data.releaseOrders);
        setInspectionsByContainer(data.inspectionsByContainer);
        setPaymentsByContainer(data.paymentsByContainer);
        setPortNamesById(data.portNamesById);
        if (data.hasInspectionErrors || data.hasPaymentErrors) setLoadingError("Some eligibility details could not be verified. Refresh to try again.");
      })
      .catch((error) => {
        if (isMounted) setLoadingError(error.response?.data?.message || "Unable to load Release Orders.");
      })
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, []);

  const orderContainerIds = useMemo(() => new Set(releaseOrders.map((order) => String(order.container?._id || order.container))), [releaseOrders]);
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return releaseOrders.filter((order) => !term || [order.container?.containerNumber, order.container?.importer?.fullName, order.container?.billOfLading?.blNumber, order.gateCodeUsed ? "collected" : order.isRevoked ? "revoked" : "released"]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [releaseOrders, search]);

  const eligibleContainers = useMemo(() => containers.filter((container) => {
    if (container.currentStage !== "INSPECTION" || container.status !== "ACTIVE" || orderContainerIds.has(String(container._id))) return false;
    const term = search.trim().toLowerCase();
    return !term || [container.containerNumber, container.importer?.fullName, container.billOfLading?.blNumber]
      .some((value) => String(value || "").toLowerCase().includes(term));
  }).map((container) => {
    const attempts = inspectionsByContainer[container._id] || [];
    const latestInspection = attempts[0];
    const payment = (paymentsByContainer[container._id] || []).find((record) => record.status === "SUCCESS");
    return { container, latestInspection, payment };
  }).filter(({ latestInspection, payment }) => latestInspection?.result === "PASS" && Boolean(payment)), [containers, inspectionsByContainer, orderContainerIds, paymentsByContainer, search]);

  // Generate a Release Order only after confirming its linked container and evidence.
  async function generateReleaseOrder(candidate) {
    const { container, payment, latestInspection } = candidate;
    const confirmed = window.confirm(
      `Generate a Release Order for ${container.containerNumber}?\n\n` +
      `Bill of Lading: ${container.billOfLading?.blNumber || "—"}\nImporter: ${container.importer?.fullName || "—"}\n` +
      `Duty receipt: ${payment.receiptNumber || "—"}\nInspection: ${latestInspection.result} (attempt ${latestInspection.inspectionNumber})`,
    );
    if (!confirmed || generatingId) return;
    setActionError("");
    setGeneratingId(container._id);
    try {
      await api.post(`/release-orders/${container._id}/create`);
      setSuccessMessage(`Release Order created for ${container.containerNumber}.`);
      await refresh();
    } catch (error) {
      setActionError(error.response?.data?.message || "Unable to generate this Release Order.");
      await refresh();
    } finally {
      setGeneratingId("");
    }
  }

  // Download the authenticated PDF without exposing its private storage path.
  async function downloadPdf(order) {
    setActionError("");
    setDownloadingId(order._id);
    try {
      const response = await api.get(`/release-orders/${order._id}/pdf`, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `Release-Order-${order.container?.containerNumber || "Container"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setActionError(error.response?.data?.message || "Unable to download this Release Order PDF.");
    } finally {
      setDownloadingId("");
    }
  }

  // Confirm and submit Admin revocation with the existing required reason field.
  async function revokeReleaseOrder(event) {
    event.preventDefault();
    if (!revokeTarget || isRevoking) return;
    const reason = event.currentTarget.elements.reason.value.trim();
    if (reason.length < 10) return;
    if (!window.confirm(`Revoke the Release Order for ${revokeTarget.container?.containerNumber}? The PDF and history will be retained.`)) return;
    setActionError("");
    setIsRevoking(true);
    try {
      await api.patch(`/release-orders/${revokeTarget._id}/revoke`, { reason });
      setSuccessMessage(`Release Order for ${revokeTarget.container?.containerNumber} was revoked.`);
      setRevokeTarget(null);
      await refresh();
    } catch (error) {
      setActionError(error.response?.data?.message || "Unable to revoke this Release Order.");
    } finally {
      setIsRevoking(false);
    }
  }

  const isCustomsOfficer = user?.role === "CUSTOMS_OFFICER";
  const isAdmin = user?.role === "ADMIN";

  return <main className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">Clearance workspace</p><h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">Release Orders</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">View authorized release records and download their official PDFs. Release decisions remain with Customs Officers.</p></div><button type="button" onClick={() => { setIsRefreshing(true); void refresh(); }} disabled={isRefreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><FaRotate className={isRefreshing ? "animate-spin" : ""} /> Refresh</button></header>
    {loadingError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{loadingError}</p>}
    {actionError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{actionError}</p>}
    {successMessage && <p role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{successMessage}<button type="button" onClick={() => setSuccessMessage("")} aria-label="Dismiss success message"><FaXmark /></button></p>}
    <label className="relative block"><span className="sr-only">Search release orders</span><FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search container, importer, B/L, or status" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100" /></label>
    {isLoading ? <p role="status" className="rounded-2xl bg-white p-12 text-center text-sm font-semibold text-slate-500">Loading Release Orders…</p> : <div className="space-y-6">
      {isCustomsOfficer && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><SectionHeader title="Eligible for Release" subtitle="Requires successful duty payment, latest inspection PASS, active status, and no existing Release Order." />{eligibleContainers.length ? <div className="divide-y divide-slate-100">{eligibleContainers.map((candidate) => <EligibleCard key={candidate.container._id} candidate={candidate} portNamesById={portNamesById} isGenerating={generatingId === candidate.container._id} onGenerate={() => void generateReleaseOrder(candidate)} />)}</div> : <EmptyState text="No containers currently meet every release requirement." />}</section>}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><SectionHeader title={isCustomsOfficer ? "Generated Release Orders" : "Your Release Orders"} subtitle="Release status and actions are checked against the authenticated user's container access." />{visibleOrders.length ? <div className="divide-y divide-slate-100">{visibleOrders.map((order) => <ReleaseOrderCard key={order._id} order={order} portNamesById={portNamesById} isAdmin={isAdmin} isDownloading={downloadingId === order._id} onDownload={() => void downloadPdf(order)} onRevoke={() => setRevokeTarget(order)} />)}</div> : <EmptyState text="No Release Orders are available for your authorized containers." />}</section>
    </div>}
    {revokeTarget && <RevokeModal order={revokeTarget} isSaving={isRevoking} onClose={() => setRevokeTarget(null)} onSubmit={revokeReleaseOrder} />}
  </main>;
}

// Introduce a queue section and its purpose.
function SectionHeader({ title, subtitle }) {
  return <header className="border-b border-slate-100 p-4 sm:p-5"><h2 className="font-extrabold text-[#172554]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></header>;
}

// Show records eligible for release with a Customs Officer-only action.
function EligibleCard({ candidate, portNamesById, isGenerating, onGenerate }) {
  const { container, payment, latestInspection } = candidate;
  return <article className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center"><div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Info label="Container number" value={container.containerNumber} /><Info label="Bill of Lading" value={container.billOfLading?.blNumber} /><Info label="Importer" value={container.importer?.fullName} /><Info label="Port" value={portName(container, portNamesById)} /><Info label="Container size" value={container.size} /><Info label="Duty receipt number" value={payment.receiptNumber || "Receipt unavailable"} /><Info label="Inspection result" value={`PASS · attempt ${latestInspection.inspectionNumber}`} /><Info label="Current stage" value={container.currentStage.replaceAll("_", " ")} /></div><button type="button" onClick={onGenerate} disabled={isGenerating} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a] disabled:opacity-50"><FaUnlock />{isGenerating ? "Generating…" : "Generate Release Order"}</button></div></article>;
}

// Show release status and the actions allowed for the current role.
function ReleaseOrderCard({ order, portNamesById, isAdmin, isDownloading, onDownload, onRevoke }) {
  const container = order.container || {};
  const status = order.isRevoked ? "REVOKED" : order.gateCodeUsed ? "COLLECTED" : container.status === "INACTIVE" ? "INACTIVE" : container.currentStage === "RELEASED" ? "RELEASED" : container.currentStage;
  return <article className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start"><div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Info label="Container number" value={container.containerNumber} emphasis /><Info label="Bill of Lading" value={container.billOfLading?.blNumber} /><Info label="Importer" value={container.importer?.fullName} /><Info label="Port" value={portName(container, portNamesById)} /><Info label="Container size" value={container.size} /><Info label="Release date" value={formatDate(order.createdAt)} /><Info label="Customs Officer" value={order.releasedBy?.fullName} /><Info label="Release status" value={<StatusBadge status={status} />} />{order.isRevoked && <><Info label="Revoked on" value={formatDate(order.revokedAt)} /><Info label="Revocation reason" value={order.revocationReason} /></>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={onDownload} disabled={isDownloading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-[#2B4593] transition hover:bg-blue-50 disabled:opacity-50"><FaDownload />{isDownloading ? "Downloading…" : "Download PDF"}</button>{isAdmin && !order.isRevoked && !order.gateCodeUsed && container.status !== "INACTIVE" && <button type="button" onClick={onRevoke} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-extrabold text-rose-700 transition hover:bg-rose-100"><FaBan />Revoke</button>}</div></div></article>;
}

// Show a single labeled detail without exposing internal model data.
function Info({ label, value, emphasis = false }) {
  return <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 break-words text-sm ${emphasis ? "font-extrabold text-[#172554]" : "font-semibold text-slate-700"}`}>{value || "—"}</p></div>;
}

// Use a visible color and label to distinguish revoked records from valid releases.
function StatusBadge({ status }) {
  const isRevoked = status === "REVOKED";
  const isCollected = status === "COLLECTED";
  const style = isRevoked ? "bg-rose-100 text-rose-800" : isCollected ? "bg-slate-100 text-slate-700" : status === "INACTIVE" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${style}`}>{status.replaceAll("_", " ")}</span>;
}

// Show a clear empty message for authorized users with no matching records.
function EmptyState({ text }) {
  return <div className="px-5 py-12 text-center"><FaFileCircleCheck className="mx-auto text-2xl text-slate-300" /><h3 className="mt-3 font-extrabold text-[#172554]">Nothing to show yet</h3><p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{text}</p></div>;
}

// Require a revocation reason and confirm the irreversible record update.
function RevokeModal({ order, isSaving, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1738]/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby="revoke-title" className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-wider text-rose-700">Admin action</p><h2 id="revoke-title" className="mt-1 text-xl font-black text-[#172554]">Revoke Release Order</h2></div><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><FaXmark /></button></header><p className="mt-3 text-sm text-slate-600">Container <strong>{order.container?.containerNumber}</strong>. Its PDF and historical record will remain available and marked revoked.</p><form onSubmit={(event) => { if (reason.trim().length < 10) { event.preventDefault(); return; } void onSubmit(event); }} className="mt-5 space-y-4"><label className="block text-sm font-bold text-slate-700">Reason<textarea name="reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} required rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Explain why this Release Order must be revoked" /></label><p className="text-xs text-slate-500">Enter at least 10 characters.</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button type="submit" disabled={isSaving || reason.trim().length < 10} className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{isSaving ? "Revoking…" : "Revoke Release Order"}</button></div></form></section></div>;
}

// Convert an existing Bill of Lading port ID or populated record to its label.
function portName(container, namesById) {
  const port = container?.billOfLading?.port;
  return typeof port === "object" ? port?.name || "Port unavailable" : namesById[String(port || "")] || "Port unavailable";
}

export default ReleaseOrdersPage;
