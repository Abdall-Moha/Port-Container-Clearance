import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaCamera, FaCheck, FaClock, FaMagnifyingGlass, FaRotate, FaTriangleExclamation, FaUpload, FaXmark } from "react-icons/fa6";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

// Format inspection dates consistently in the Customs workspace.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// Load Customs-authorized container queues and existing inspection histories.
async function loadInspectionWorkspace() {
  const [containersResponse, officersResponse] = await Promise.all([
    api.get("/containers"),
    api.get("/users/active-customs-officers"),
  ]);
  let portNamesById = {};
  try {
    const portsResponse = await api.get("/ports");
    portNamesById = Object.fromEntries((portsResponse.data?.ports || []).map((port) => [String(port._id), port.name]));
  } catch {
    // Port names are helpful labels but are not required for inspection actions.
  }
  const containers = containersResponse.data?.containers || [];
  const inspectionResults = await Promise.allSettled(containers.map(async (container) => {
    const response = await api.get(`/inspections/container/${container._id}`);
    return [container._id, response.data?.inspections || []];
  }));
  const histories = {};
  let hadHistoryErrors = false;
  inspectionResults.forEach((result) => {
    if (result.status === "fulfilled") histories[result.value[0]] = result.value[1];
    else hadHistoryErrors = true;
  });
  const pendingContainers = containers.filter((container) => container.currentStage === "DUTY_PAID");
  const paymentResults = await Promise.allSettled(pendingContainers.map(async (container) => {
    const response = await api.get(`/payments/container/${container._id}`);
    return [container._id, response.data?.payments || []];
  }));
  const payments = {};
  let hadPaymentErrors = false;
  paymentResults.forEach((result) => {
    if (result.status === "fulfilled") payments[result.value[0]] = result.value[1];
    else hadPaymentErrors = true;
  });
  return {
    containers,
    histories,
    payments,
    officers: officersResponse.data?.users || [],
    portNamesById,
    hadHistoryErrors,
    hadPaymentErrors,
  };
}

// Manage inspection scheduling, results, photos, and reinspection history.
function InspectionsPage() {
  const { user } = useAuth();
  const [containers, setContainers] = useState([]);
  const [histories, setHistories] = useState({});
  const [payments, setPayments] = useState({});
  const [officers, setOfficers] = useState([]);
  const [portNamesById, setPortNamesById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // Refresh the existing server queues, inspection history, payment state, and active officers.
  const refresh = useCallback(async () => {
    try {
      setPageError("");
      const data = await loadInspectionWorkspace();
      setContainers(data.containers);
      setHistories(data.histories);
      setPayments(data.payments);
      setOfficers(data.officers);
      setPortNamesById(data.portNamesById);
      if (data.hadHistoryErrors || data.hadPaymentErrors) setPageError("Some history or payment details could not be loaded. Refresh to try again.");
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to load inspection information.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadInspectionWorkspace()
      .then((data) => {
        if (!isMounted) return;
        setContainers(data.containers);
        setHistories(data.histories);
        setPayments(data.payments);
        setOfficers(data.officers);
        setPortNamesById(data.portNamesById);
        if (data.hadHistoryErrors || data.hadPaymentErrors) setPageError("Some history or payment details could not be loaded. Refresh to try again.");
      })
      .catch((error) => {
        if (isMounted) setPageError(error.response?.data?.message || "Unable to load inspection information.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const filteredContainers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return containers;
    return containers.filter((container) => [container.containerNumber, container.importer?.fullName, container.billOfLading?.blNumber].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [containers, search]);

  const awaiting = filteredContainers.filter((container) => container.currentStage === "DUTY_PAID");
  const inspecting = filteredContainers.filter((container) => container.currentStage === "INSPECTION" && container.status !== "INACTIVE");
  const held = inspecting.filter((container) => container.status === "HELD");
  const activeInspection = inspecting.filter((container) => container.status === "ACTIVE");
  const completed = Object.entries(histories).flatMap(([containerId, attempts]) => {
    const container = containers.find((item) => String(item._id) === String(containerId));
    return (attempts || []).filter((attempt) => attempt.result !== "PENDING").map((attempt) => ({ container, attempt }));
  }).filter(({ container }) => container && filteredContainers.some((item) => item._id === container._id)).sort((a, b) => new Date(b.attempt.completedAt || 0) - new Date(a.attempt.completedAt || 0));

  // Request an authenticated inspection photo and create a temporary preview URL.
  async function viewPhoto(inspection, photo) {
    setPageError("");
    try {
      const response = await api.get(`/inspections/${inspection._id}/photos/${photo._id}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: photo.mimeType }));
      setPhotoPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { url, name: photo.fileName, mimeType: photo.mimeType };
      });
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to open this inspection photo.");
    }
  }

  // Revoke an open photo URL when the viewer closes or the page unmounts.
  useEffect(() => () => { if (photoPreview?.url) URL.revokeObjectURL(photoPreview.url); }, [photoPreview]);

  // Confirm scheduling before sending the supported inspection request.
  async function scheduleInspection(form) {
    if (!window.confirm(`Schedule an inspection for ${scheduleTarget?.containerNumber}?`)) return;
    setPageError("");
    try {
      await api.post(`/inspections/${scheduleTarget._id}/schedule`, { scheduledAt: form.scheduledAt, inspectorId: form.inspectorId || null });
      setSuccessMessage("Inspection scheduled successfully.");
      setScheduleTarget(null);
      await refresh();
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to schedule the inspection.");
    }
  }

  // Upload any selected photos while pending, then record the chosen inspection result.
  async function submitResult(form) {
    if (!window.confirm(`Record ${form.result} for ${resultTarget?.container?.containerNumber}? This result cannot be changed.`)) return { photosUploaded: false };
    setPageError("");
    let photosUploaded = false;
    try {
      if (form.photos.length) {
        const body = new FormData();
        form.photos.forEach((file) => body.append("photos", file));
        await api.post(`/inspections/${resultTarget.attempt._id}/photos`, body, { headers: { "Content-Type": "multipart/form-data" } });
        photosUploaded = true;
      }
      await api.patch(`/inspections/${resultTarget.attempt._id}/result`, { result: form.result, notes: form.notes });
      setSuccessMessage(form.result === "PASS" ? "Inspection passed. The container is eligible for a Release Order." : "Inspection failed and the container is on hold. It can be scheduled for reinspection.");
      setResultTarget(null);
      await refresh();
        return { photosUploaded, photosAdded: form.photos.length };
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to save the inspection result.");
      if (photosUploaded) await refresh();
      return { photosUploaded, photosAdded: form.photos.length };
    }
  }

  return <main className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">Customs workspace</p><h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">Inspection Management</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Schedule inspections, record findings, attach photos, and review the complete history of each attempt.</p></div><button type="button" onClick={() => { setIsRefreshing(true); void refresh(); }} disabled={isRefreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><FaRotate className={isRefreshing ? "animate-spin" : ""} /> Refresh</button></header>
    {pageError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{pageError}</p>}
    {successMessage && <p role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{successMessage}<button type="button" onClick={() => setSuccessMessage("")} aria-label="Dismiss message"><FaXmark /></button></p>}
    <label className="relative block"><span className="sr-only">Search inspections</span><FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search container, importer, or B/L" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100" /></label>
    {isLoading ? <p role="status" className="rounded-2xl bg-white p-12 text-center text-sm font-semibold text-slate-500">Loading inspection queues…</p> : <div className="space-y-6">
      <InspectionSection title="Awaiting Inspection" subtitle="Paid containers ready for their first inspection." icon={FaClock} empty="No containers are awaiting inspection.">
        {awaiting.map((container) => <AwaitingCard key={container._id} container={container} payments={payments[container._id] || []} portNamesById={portNamesById} onSchedule={() => setScheduleTarget(container)} />)}
      </InspectionSection>
      <InspectionSection title="Scheduled / In Progress" subtitle="Active inspections that may receive a result." icon={FaMagnifyingGlass} empty="No active inspections are scheduled.">
        {activeInspection.map((container) => <ActiveContainerCard key={container._id} user={user} container={container} portNamesById={portNamesById} attempts={histories[container._id] || []} onResult={(attempt) => setResultTarget({ container, attempt })} />)}
      </InspectionSection>
      <InspectionSection title="Held Containers" subtitle="Failed inspections remain at INSPECTION and can be scheduled again." icon={FaTriangleExclamation} empty="No containers are currently held.">
        {held.map((container) => <HeldContainerCard key={container._id} user={user} container={container} portNamesById={portNamesById} attempts={histories[container._id] || []} onSchedule={() => setScheduleTarget(container)} onResult={(attempt) => setResultTarget({ container, attempt })} />)}
      </InspectionSection>
      <InspectionSection title="Completed Inspections" subtitle="Every saved PASS and FAIL attempt remains in the history." icon={FaCheck} empty="No completed inspection results yet.">
        {completed.map(({ container, attempt }) => <CompletedInspection key={attempt._id} container={container} portNamesById={portNamesById} attempt={attempt} onViewPhoto={viewPhoto} />)}
      </InspectionSection>
    </div>}
    {scheduleTarget && <ScheduleModal container={scheduleTarget} officers={officers} onClose={() => setScheduleTarget(null)} onSubmit={scheduleInspection} />}
    {resultTarget && <ResultModal container={resultTarget.container} attempt={resultTarget.attempt} onClose={() => setResultTarget(null)} onSubmit={submitResult} />}
    {photoPreview && <PhotoModal photo={photoPreview} onClose={() => setPhotoPreview(null)} />}
  </main>;
}

// Display one inspection queue as a labeled card section.
function InspectionSection({ title, subtitle, icon: Icon, empty, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-start gap-3 border-b border-slate-100 p-4 sm:p-5"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2B4593]"><Icon /></span><div><h2 className="font-extrabold text-[#172554]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div></header>{items.length ? <div className="divide-y divide-slate-100">{items}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">{empty}</p>}</section>;
}

// Show identifying details and safe payment status before first scheduling.
function AwaitingCard({ container, payments, onSchedule, portNamesById }) {
  const payment = payments.find((item) => item.status === "SUCCESS");
  const port = container.billOfLading?.port;
  return <article className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5"><ContainerSummary container={container} port={typeof port === "object" ? port?.name : portNamesById[String(port || "")] || "Port unavailable"} /><div className="flex items-center gap-3"><StatusPill label={payment ? "Payment complete" : "Payment record unavailable"} tone={payment ? "green" : "amber"} /><button type="button" onClick={onSchedule} disabled={!payment} className="rounded-xl bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#21377a] disabled:cursor-not-allowed disabled:opacity-50">Schedule inspection</button></div></article>;
}

// Show the latest active attempt and allow its assigned inspector to submit a result.
function ActiveContainerCard({ user, container, attempts, onResult, portNamesById }) {
  const pending = attempts.find((attempt) => attempt.result === "PENDING");
  const canRecord = pending && canManageInspection(user, pending);
  return <article className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5"><div className="min-w-0 flex-1"><ContainerSummary container={container} port={portLabel(container, portNamesById)} /><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><Info label="Scheduled" value={formatDate(pending?.scheduledAt)} /><Info label="Assigned inspector" value={pending?.inspector?.fullName || "Not assigned"} /><Info label="Status" value={pending ? "Scheduled / awaiting result" : "No pending attempt"} /></div></div>{canRecord && <button type="button" onClick={() => onResult(pending)} className="rounded-xl bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#21377a]">Record result</button>}</article>;
}

// Show the failed reason and support a preserved follow-up attempt.
function HeldContainerCard({ user, container, attempts, onSchedule, onResult, portNamesById }) {
  const latest = attempts[0];
  const pending = attempts.find((attempt) => attempt.result === "PENDING");
  const canRecord = pending && canManageInspection(user, pending);
  return <article className="space-y-4 p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><ContainerSummary container={container} port={portLabel(container, portNamesById)} /><div className="flex flex-wrap gap-2"><StatusPill label="Held after failed inspection" tone="red" />{canRecord && <button type="button" onClick={() => onResult(pending)} className="rounded-xl bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white">Record result</button>}{!pending && <button type="button" onClick={onSchedule} className="rounded-xl bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white">Schedule reinspection</button>}</div></div><div className="rounded-xl border border-rose-100 bg-rose-50 p-4"><p className="text-xs font-extrabold uppercase tracking-wide text-rose-700">Latest hold reason</p><p className="mt-1 text-sm font-medium text-rose-900">{latest?.notes || "Hold reason unavailable"}</p><p className="mt-2 text-xs text-rose-700">{latest ? `Attempt ${latest.inspectionNumber} · ${formatDate(latest.completedAt)}` : "Inspection history unavailable"}</p></div>{pending && <Info label="Reinspection scheduled" value={`${formatDate(pending.scheduledAt)} · ${pending.inspector?.fullName || "Not assigned"}`} />}</article>;
}

// Display saved result, inspector, notes, and private photo-view actions.
function CompletedInspection({ container, attempt, onViewPhoto, portNamesById }) {
  const passed = attempt.result === "PASS";
  return <article className="space-y-4 p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><ContainerSummary container={container} port={portLabel(container, portNamesById)} /><StatusPill label={passed ? "PASS" : "FAIL"} tone={passed ? "green" : "red"} /></div><div className="grid gap-3 text-sm sm:grid-cols-3"><Info label="Inspection date" value={formatDate(attempt.completedAt || attempt.scheduledAt)} /><Info label="Inspector" value={attempt.inspector?.fullName || "Inspector unavailable"} /><Info label="Attempt" value={`#${attempt.inspectionNumber}`} /></div>{attempt.notes && <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{attempt.notes}</p>}{attempt.photos?.length > 0 && <div><p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Inspection photos</p><div className="flex flex-wrap gap-2">{attempt.photos.map((photo) => <button key={photo._id} type="button" onClick={() => void onViewPhoto(attempt, photo)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#2B4593] hover:bg-blue-50"><FaCamera /> View {photo.fileName}</button>)}</div></div>}</article>;
}

// Show container details and its port label.
function ContainerSummary({ container, port }) {
  return <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{container.importer?.fullName || "Importer"} · {port || "Port unavailable"}</p><h3 className="mt-1 text-lg font-black text-[#172554]">{container.containerNumber}</h3><p className="mt-1 text-xs text-slate-500">{container.size} · B/L {container.billOfLading?.blNumber || "—"}</p></div>;
}

// Render a compact labeled value in the inspection queue.
function Info({ label, value }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-700">{value || "—"}</p></div>;
}

// Distinguish inspection outcomes with accessible color labels.
function StatusPill({ label, tone }) {
  const colors = { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-rose-100 text-rose-800" };
  return <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-extrabold ${colors[tone] || colors.amber}`}>{label}</span>;
}

// Show the supported date, time, and active inspector fields.
function ScheduleModal({ container, officers, onClose, onSubmit }) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [inspectorId, setInspectorId] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Validate required scheduling fields and pass the endpoint's exact body.
  async function handleSubmit(event) {
    event.preventDefault();
    if (!scheduledAt) { setError("Choose an inspection date and time."); return; }
    if (new Date(scheduledAt) <= new Date()) { setError("Choose a date and time in the future."); return; }
    setIsSaving(true);
    await onSubmit({ scheduledAt: new Date(scheduledAt).toISOString(), inspectorId });
    setIsSaving(false);
  }

  return <ModalShell title="Schedule inspection" onClose={onClose}><p className="text-sm text-slate-600">Container <strong>{container.containerNumber}</strong></p>{officers.length === 0 && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">You can schedule this inspection without assigning another officer.</p>}<form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4"><label className="block text-sm font-bold text-slate-700">Inspection date and time<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" required /></label><label className="block text-sm font-bold text-slate-700">Inspector <span className="font-normal text-slate-500">(optional)</span><select value={inspectorId} onChange={(event) => setInspectorId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"><option value="">No inspector assigned</option>{officers.map((officer) => <option key={officer._id} value={officer._id}>{officer.fullName}</option>)}</select></label>{error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button type="submit" disabled={isSaving} className="rounded-lg bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{isSaving ? "Scheduling…" : "Schedule inspection"}</button></div></form></ModalShell>;
}

// Collect a PASS or FAIL result, notes, and optional supported image files.
function ResultModal({ container, attempt, onClose, onSubmit }) {
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInput = useRef(null);
  const previewUrls = useRef(new Set());
  const [savedPhotoCount, setSavedPhotoCount] = useState(attempt.photos?.length || 0);
  const remainingPhotoSlots = Math.max(0, 5 - savedPhotoCount);

  // Release temporary thumbnail URLs when the result dialog is removed.
  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  // Add valid unique photos without replacing files selected earlier.
  function addPhotos(event) {
    const chosenFiles = Array.from(event.target.files || []);
    event.target.value = "";
    setError("");
    const additions = [];
    const existingKeys = new Set(photos.map((item) => item.key));

    for (const file of chosenFiles) {
      const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
      if (existingKeys.has(key)) continue;
      if (!["image/jpeg", "image/png"].includes(file.type) || !/\.(jpe?g|png)$/i.test(file.name)) {
        setError(`${file.name} is not a JPG, JPEG, or PNG image.`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`${file.name} is larger than the 5 MB limit.`);
        continue;
      }
      if (photos.length + additions.length >= remainingPhotoSlots) {
        setError(`This inspection can store up to five photos total. ${remainingPhotoSlots} slot(s) remain.`);
        break;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      additions.push({ file, key, previewUrl });
      existingKeys.add(key);
    }

    if (additions.length) setPhotos((current) => [...current, ...additions]);
  }

  // Remove one selected file and release its thumbnail URL.
  function removePhoto(key) {
    const selectedPhoto = photos.find((item) => item.key === key);
    if (selectedPhoto) {
      URL.revokeObjectURL(selectedPhoto.previewUrl);
      previewUrls.current.delete(selectedPhoto.previewUrl);
    }
    setPhotos((current) => current.filter((item) => item.key !== key));
  }

  // Validate the result and photo restrictions before submitting.
  async function handleSubmit(event) {
    event.preventDefault();
    if (!result) { setError("Choose PASS or FAIL."); return; }
    if (result === "FAIL" && notes.trim().length < 10) { setError("A failure reason of at least 10 characters is required."); return; }
    if (notes.trim().length > 1000) { setError("Notes cannot exceed 1,000 characters."); return; }
    if (photos.length > remainingPhotoSlots) { setError("The photo limit for this inspection has been reached."); return; }
    setIsSaving(true);
    const outcome = await onSubmit({ result, notes: notes.trim(), photos: photos.map((item) => item.file) });
    if (outcome?.photosUploaded) {
      setSavedPhotoCount((count) => count + (outcome.photosAdded || photos.length));
      photos.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        previewUrls.current.delete(item.previewUrl);
      });
      setPhotos([]);
    }
    setIsSaving(false);
  }

  return <ModalShell title="Record inspection result" onClose={onClose}><p className="text-sm text-slate-600">{container.containerNumber} · Attempt {attempt.inspectionNumber}</p><form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4"><fieldset><legend className="text-sm font-bold text-slate-700">Result</legend><div className="mt-2 grid grid-cols-2 gap-3"><button type="button" onClick={() => setResult("PASS")} className={`rounded-xl border px-4 py-3 text-sm font-extrabold ${result === "PASS" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600"}`}><FaCheck className="mr-2 inline" />PASS</button><button type="button" onClick={() => setResult("FAIL")} className={`rounded-xl border px-4 py-3 text-sm font-extrabold ${result === "FAIL" ? "border-rose-600 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-600"}`}><FaTriangleExclamation className="mr-2 inline" />FAIL</button></div></fieldset><label className="block text-sm font-bold text-slate-700">Inspection notes<textarea rows="4" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={result === "FAIL" ? "Explain why the container failed inspection" : "Add inspection notes"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label><section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-sm font-extrabold text-slate-800">Inspection photos (optional)</h3><p className="mt-1 text-xs text-slate-500">JPG, JPEG, or PNG · maximum 5 MB each · {remainingPhotoSlots} slot(s) available</p></div><input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple onChange={addPhotos} className="sr-only" /><button type="button" onClick={() => fileInput.current?.click()} disabled={remainingPhotoSlots === 0} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2B4593] bg-white px-4 py-2.5 text-sm font-extrabold text-[#2B4593] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"><FaUpload />{photos.length ? "Add More Photos" : "Choose Inspection Photos"}</button></div>{photos.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">No new photos selected. Choose one or more images to attach.</p> : <><p className="mt-4 text-xs font-bold text-slate-600">{photos.length} photo(s) selected</p><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{photos.map((item) => <div key={item.key} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"><img src={item.previewUrl} alt={`Preview of ${item.file.name}`} className="size-16 shrink-0 rounded-md bg-slate-100 object-cover" /><div className="min-w-0 flex-1"><p className="break-all text-xs font-bold text-slate-700">{item.file.name}</p><p className="mt-1 text-[11px] text-slate-500">{(item.file.size / 1024).toFixed(0)} KB</p></div><button type="button" onClick={() => removePhoto(item.key)} aria-label={`Remove ${item.file.name}`} className="rounded-md p-2 text-rose-600 hover:bg-rose-50"><FaXmark /></button></div>)}</div></>}</section>{error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button type="submit" disabled={isSaving} className="rounded-lg bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{isSaving ? "Saving…" : "Save result"}</button></div></form></ModalShell>;
}

// Confirm whether the signed-in officer owns the pending inspection attempt.
function canManageInspection(user, inspection) {
  const userId = user?.id || user?._id;
  const responsible = inspection.inspector?._id || inspection.inspector || inspection.scheduledBy?._id || inspection.scheduledBy;
  return Boolean(userId && responsible && String(userId) === String(responsible));
}

// Display a responsive dialog shell for inspection actions.
function ModalShell({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1738]/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><header className="mb-4 flex items-center justify-between gap-4"><h2 className="text-xl font-black text-[#172554]">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><FaXmark /></button></header>{children}</section></div>;
}

// Show an authenticated inspection photo in a full-screen responsive viewer.
function PhotoModal({ photo, onClose }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1738]/90 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={photo.name} className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white"><header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div className="min-w-0"><h2 className="truncate text-sm font-extrabold text-[#172554]">{photo.name}</h2><p className="text-xs text-slate-500">{photo.mimeType}</p></div><button type="button" onClick={onClose} aria-label="Close photo viewer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><FaXmark /></button></header><div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-3"><img src={photo.url} alt={photo.name} className="max-h-[78vh] max-w-full object-contain" /></div></section></div>;
}

// Read a port name from a populated Bill of Lading without assuming an ID is a name.
function portLabel(container, portNamesById = {}) {
  const port = container.billOfLading?.port;
  return typeof port === "object" ? port?.name : portNamesById[String(port || "")] || "Port information unavailable";
}

export default InspectionsPage;
