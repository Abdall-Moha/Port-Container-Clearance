import { useCallback, useEffect, useMemo, useState } from "react";
import { FaLink, FaMagnifyingGlass, FaRotate, FaXmark } from "react-icons/fa6";
import api from "../config/api.js";

// Format a saved date for the Admin's delivery history.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// Show webhook delivery configuration, history, attempt details, and eligible resends.
function WebhooksManagementPage() {
  const [shippingLines, setShippingLines] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [editingLine, setEditingLine] = useState(null);
  const [endpoint, setEndpoint] = useState("");
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyDeliveryId, setBusyDeliveryId] = useState("");

  // Load existing shipping-line settings and delivery records from their Admin APIs.
  const loadData = useCallback(async () => {
    try {
      const [lineResponse, deliveryResponse] = await Promise.all([
        api.get("/shipping-lines"),
        api.get("/webhooks"),
      ]);
      setShippingLines(lineResponse.data?.shippingLines || []);
      setDeliveries(deliveryResponse.data?.deliveries || []);
      setPageError("");
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to load webhook information. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load the current webhook configuration and delivery history on page entry.
  useEffect(() => {
    const requestId = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(requestId);
  }, [loadData]);

  const filteredDeliveries = useMemo(() => deliveries.filter((delivery) => {
    const lineId = delivery.shippingLine?._id || delivery.shippingLine;
    const text = `${delivery.container?.containerNumber || ""} ${delivery.eventId || ""}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase()))
      && (!statusFilter || delivery.status === statusFilter)
      && (!lineFilter || String(lineId) === lineFilter);
  }), [deliveries, lineFilter, search, statusFilter]);

  // Open the endpoint editor for one existing shipping line.
  function openEditor(line) {
    setEditingLine(line);
    setEndpoint(line.webhookUrl || "");
    setFormError("");
    setSuccessMessage("");
  }

  // Save an endpoint through the existing Admin-authorized Shipping Line update route.
  async function handleSaveEndpoint(event) {
    event.preventDefault();
    const trimmedEndpoint = endpoint.trim();
    if (trimmedEndpoint) {
      try {
        const parsed = new URL(trimmedEndpoint);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("invalid");
      } catch {
        setFormError("Enter a valid HTTP or HTTPS endpoint URL.");
        return;
      }
    }
    if (!window.confirm(`${trimmedEndpoint ? "Save the webhook endpoint" : "Remove the webhook endpoint"} for ${editingLine.name}?`)) return;
    setIsSaving(true);
    setFormError("");
    try {
      await api.patch(`/shipping-lines/${editingLine._id}`, { webhookUrl: trimmedEndpoint });
      setSuccessMessage(`Webhook endpoint ${trimmedEndpoint ? "saved" : "removed"} for ${editingLine.name}.`);
      setEditingLine(null);
      await loadData();
    } catch (error) {
      setFormError(error.response?.data?.message || "Unable to save this webhook endpoint.");
    } finally {
      setIsSaving(false);
    }
  }

  // Fetch the selected delivery's complete payload and attempt history.
  async function openDelivery(delivery) {
    setSelectedDelivery(delivery);
    try {
      const response = await api.get(`/webhooks/${delivery._id}`);
      setSelectedDelivery(response.data?.delivery || delivery);
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to load delivery details.");
    }
  }

  // Start a new retry cycle for a failed delivery through the existing Admin route.
  async function handleResend(delivery) {
    if (delivery.status !== "FAILED" || delivery.container?.status === "INACTIVE" || !window.confirm(`Resend webhook event ${delivery.eventId}?`)) return;
    setBusyDeliveryId(String(delivery._id));
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.post(`/webhooks/${delivery._id}/resend`);
      setSuccessMessage(response.data?.message || "Webhook resend request completed.");
      await loadData();
      if (selectedDelivery?._id === delivery._id) await openDelivery(delivery);
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to resend this webhook.");
      await loadData();
    } finally {
      setBusyDeliveryId("");
    }
  }

  // Refresh both configuration and delivery monitoring data.
  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
  }

  const buttonClass = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50";

  return <div className="space-y-7">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">Integrations</p><h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">Webhooks</h1><p className="mt-2 text-sm text-slate-600">Configure shipping-line endpoints and monitor delivery attempts.</p></div>
      <button type="button" onClick={() => void handleRefresh()} disabled={isRefreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FaRotate className={isRefreshing ? "animate-spin" : ""} /> Refresh</button>
    </header>

    {pageError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{pageError}</p>}
    {successMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{successMessage}</p>}

    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div><h2 className="text-lg font-extrabold text-[#172554]">Shipping-line endpoints</h2><p className="mt-1 text-sm text-slate-500">Each shipping line can use one endpoint. Endpoint activation follows the shipping line's active status.</p></div>
      {isLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading configurations…</p> : shippingLines.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No shipping lines are configured yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Shipping line</th><th className="px-3 py-3">Endpoint</th><th className="px-3 py-3">Line status</th><th className="px-3 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{shippingLines.map((line) => <tr key={line._id}><td className="px-3 py-4"><p className="font-extrabold text-[#172554]">{line.name}</p><p className="text-xs text-slate-500">{line.code}</p></td><td className="max-w-sm break-all px-3 py-4 text-slate-600">{line.webhookUrl || <span className="italic text-slate-400">Not configured</span>}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${line.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{line.isActive ? "Active" : "Inactive"}</span></td><td className="px-3 py-4"><button type="button" onClick={() => openEditor(line)} className={buttonClass}>{line.webhookUrl ? "Edit endpoint" : "Configure endpoint"}</button></td></tr>)}</tbody></table></div>}
    </section>

    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end"><div><h2 className="text-lg font-extrabold text-[#172554]">Delivery history</h2><p className="mt-1 text-sm text-slate-500">Newest deliveries first. Attempt history is retained when a failed event is resent.</p></div><div className="grid gap-2 sm:grid-cols-3">
        <label className="relative"><span className="sr-only">Search container or event ID</span><FaMagnifyingGlass className="absolute left-3 top-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Container or event ID" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter delivery status" className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="">All statuses</option>{["PENDING", "SENDING", "DELIVERED", "FAILED"].map((status) => <option key={status}>{status}</option>)}</select>
        <select value={lineFilter} onChange={(event) => setLineFilter(event.target.value)} aria-label="Filter shipping line" className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="">All shipping lines</option>{shippingLines.map((line) => <option value={line._id} key={line._id}>{line.name}</option>)}</select>
      </div></div>
      {isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading delivery history…</p> : filteredDeliveries.length === 0 ? <div className="rounded-xl bg-slate-50 px-4 py-12 text-center"><FaLink className="mx-auto text-2xl text-slate-300" /><p className="mt-3 font-bold text-slate-700">No webhook deliveries found</p><p className="mt-1 text-sm text-slate-500">Delivery records will appear here when a configured shipping line receives a clearance event.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Event / container</th><th className="px-3 py-3">Shipping line</th><th className="px-3 py-3">Transition</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Attempts</th><th className="px-3 py-3">Last / next attempt</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredDeliveries.map((delivery) => <tr key={delivery._id}><td className="px-3 py-4"><p className="font-bold text-[#172554]">{delivery.container?.containerNumber || "Container unavailable"}</p><p className="max-w-48 truncate text-xs text-slate-500" title={delivery.eventId}>{delivery.eventId}</p></td><td className="px-3 py-4">{delivery.shippingLine?.name || "Shipping line unavailable"}</td><td className="px-3 py-4 text-xs text-slate-600">{delivery.clearanceEvent?.fromStage || "—"} → {delivery.clearanceEvent?.toStage || "—"}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${delivery.status === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : delivery.status === "FAILED" ? "bg-rose-50 text-rose-700" : delivery.status === "SENDING" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"}`}>{delivery.status}</span></td><td className="px-3 py-4 font-semibold">{delivery.attempts}</td><td className="px-3 py-4 text-xs text-slate-600"><p>{formatDate(delivery.lastAttemptAt)}</p>{delivery.nextRetryAt && <p className="mt-1 text-amber-700">Retry: {formatDate(delivery.nextRetryAt)}</p>}{delivery.responseStatus && <p className="mt-1">HTTP {delivery.responseStatus}</p>}</td><td className="px-3 py-4"><div className="flex gap-2"><button type="button" onClick={() => void openDelivery(delivery)} className={buttonClass}>Details</button>{delivery.status === "FAILED" && delivery.container?.status !== "INACTIVE" && <button type="button" disabled={Boolean(busyDeliveryId)} onClick={() => void handleResend(delivery)} className="rounded-lg bg-[#2B4593] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busyDeliveryId === String(delivery._id) ? "Sending…" : "Resend"}</button>}</div></td></tr>)}</tbody></table></div>}
    </section>

    {editingLine && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setEditingLine(null); }}><section role="dialog" aria-modal="true" aria-labelledby="webhook-config-title" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#2B4593]">{editingLine.name}</p><h2 id="webhook-config-title" className="mt-1 text-xl font-black text-[#172554]">Webhook endpoint</h2></div><button type="button" onClick={() => setEditingLine(null)} disabled={isSaving} aria-label="Close endpoint editor" className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><FaXmark /></button></div><form onSubmit={(event) => void handleSaveEndpoint(event)} className="mt-5 space-y-4"><label className="block text-sm font-bold text-slate-700">Endpoint URL <span className="font-normal text-slate-400">(leave blank to remove)</span><input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://partner.example.com/events" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-400" /></label>{formError && <p role="alert" className="text-sm font-semibold text-rose-700">{formError}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={isSaving} onClick={() => setEditingLine(null)} className={buttonClass}>Cancel</button><button type="submit" disabled={isSaving} className="rounded-lg bg-[#2B4593] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">{isSaving ? "Saving…" : "Save endpoint"}</button></div></form></section></div>}

    {selectedDelivery && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDelivery(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delivery-detail-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-widest text-[#2B4593]">{selectedDelivery.status}</p><h2 id="delivery-detail-title" className="mt-1 text-xl font-black text-[#172554]">Delivery details</h2><p className="mt-1 break-all text-xs text-slate-500">{selectedDelivery.eventId}</p></div><button type="button" onClick={() => setSelectedDelivery(null)} aria-label="Close delivery details" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><FaXmark /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Container</p><p className="mt-1 font-bold">{selectedDelivery.container?.containerNumber || "Unavailable"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Shipping line</p><p className="mt-1 font-bold">{selectedDelivery.shippingLine?.name || "Unavailable"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Attempts / next retry</p><p className="mt-1 font-bold">{selectedDelivery.attempts} / {formatDate(selectedDelivery.nextRetryAt)}</p></div></div><h3 className="mt-6 font-extrabold text-[#172554]">Original event payload</h3><pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-blue-100">{JSON.stringify(selectedDelivery.payload, null, 2)}</pre><div className="mt-6 flex flex-wrap items-center justify-between gap-3"><h3 className="font-extrabold text-[#172554]">Attempt history ({selectedDelivery.attemptHistory?.length || 0})</h3>{selectedDelivery.status === "FAILED" && selectedDelivery.container?.status !== "INACTIVE" && <button type="button" onClick={() => void handleResend(selectedDelivery)} disabled={Boolean(busyDeliveryId)} className="rounded-lg bg-[#2B4593] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyDeliveryId === String(selectedDelivery._id) ? "Sending…" : "Resend failed delivery"}</button>}</div><div className="mt-3 space-y-3">{selectedDelivery.attemptHistory?.length ? selectedDelivery.attemptHistory.map((attempt, index) => <article key={`${attempt.attemptNumber}-${index}`} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold text-[#172554]">Attempt {attempt.attemptNumber} · {attempt.outcome}</p><p className="text-xs text-slate-500">{formatDate(attempt.attemptedAt)}</p></div><p className="mt-2 text-sm text-slate-600">HTTP response: {attempt.responseStatus ?? "No response"}</p>{attempt.errorMessage && <p className="mt-1 break-words text-sm text-rose-700">{attempt.errorMessage}</p>}{attempt.responseBody && <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-slate-600">Response details</summary><pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-xs text-slate-600">{attempt.responseBody}</pre></details>}</article>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No attempt history is available.</p>}</div><div className="mt-5 flex justify-end"><button type="button" onClick={() => setSelectedDelivery(null)} className={buttonClass}>Close</button></div></section></div>}
  </div>;
}

export default WebhooksManagementPage;
