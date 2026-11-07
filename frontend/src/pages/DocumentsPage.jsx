import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaDownload, FaFileLines, FaUpload } from "react-icons/fa6";
import { useSearchParams } from "react-router-dom";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

const documentTypes = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
  "CERTIFICATE_OF_ORIGIN",
];

const documentLabels = {
  COMMERCIAL_INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  BILL_OF_LADING: "Bill of Lading",
  CERTIFICATE_OF_ORIGIN: "Certificate of Origin",
};

// Fetch the authorized document list for one container.
async function fetchDocumentsForContainer(containerId) {
  const response = await api.get(`/documents/container/${containerId}`);
  return Array.isArray(response.data?.documents) ? response.data.documents : [];
}

// Format an API date while keeping missing review dates visibly empty.
function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

// Provide role-scoped document viewing, protected uploads, and Customs review.
function DocumentsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedContainerId = useRef(searchParams.get("container"));
  const [containers, setContainers] = useState([]);
  const [ports, setPorts] = useState([]);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [expandedDocumentId, setExpandedDocumentId] = useState("");
  const [versionsByDocument, setVersionsByDocument] = useState({});
  const [isLoadingContainers, setIsLoadingContainers] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [uploadType, setUploadType] = useState(documentTypes[0]);
  const [uploadFile, setUploadFile] = useState(null);
  const uploadInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewReason, setReviewReason] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [isReturning, setIsReturning] = useState(false);

  const isCustomsOfficer = user?.role === "CUSTOMS_OFFICER";
  const canUpload = ["IMPORTER", "CLEARING_AGENT"].includes(user?.role);
  const selectedContainer = containers.find((container) => container._id === selectedContainerId);

  // Load the role-filtered container collection; Customs sees only review-stage cases here.
  useEffect(() => {
    let isMounted = true;
    const params = isCustomsOfficer ? { stage: "CUSTOMS_REVIEW" } : {};
    api.get("/containers", { params })
      .then((response) => {
        if (!isMounted) return;
        const records = Array.isArray(response.data?.containers) ? response.data.containers : [];
        setContainers(records);
        const authorizedSelection = records.find((container) => container._id === requestedContainerId.current);
        setSelectedContainerId(authorizedSelection?._id || records[0]?._id || "");
      })
      .catch((error) => {
        if (isMounted) setPageError(error.response?.data?.message || "Unable to load containers.");
      })
      .finally(() => { if (isMounted) setIsLoadingContainers(false); });
    return () => { isMounted = false; };
  }, [isCustomsOfficer]);

  // Resolve port references supplied as IDs in the container response.
  useEffect(() => {
    let isMounted = true;
    api.get("/ports").then((response) => {
      if (isMounted) setPorts(Array.isArray(response.data?.ports) ? response.data.ports : []);
    }).catch(() => {
      // Document access does not depend on optional port labels.
    });
    return () => { isMounted = false; };
  }, []);

  const portNamesById = useMemo(() => new Map(ports.map((port) => [String(port._id), port.name])), [ports]);
  function getPortName(portValue) {
    if (portValue && typeof portValue === "object") {
      return portValue.name || portNamesById.get(String(portValue._id)) || "";
    }
    return portNamesById.get(String(portValue || "")) || "";
  }

  // Read documents only for the selected container using the access-controlled API.
  const loadDocuments = useCallback(async () => {
    if (!selectedContainerId) return;
    try {
      const loadedDocuments = await fetchDocumentsForContainer(selectedContainerId);
      setDocuments(loadedDocuments);
      setVersionsByDocument({});
      setExpandedDocumentId("");
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to load documents for this container.");
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [selectedContainerId]);

  useEffect(() => {
    if (!selectedContainerId) return undefined;
    let isMounted = true;
    fetchDocumentsForContainer(selectedContainerId)
      .then((loadedDocuments) => {
        if (isMounted) {
          setDocuments(loadedDocuments);
          setVersionsByDocument({});
          setExpandedDocumentId("");
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted) setPageError(error.response?.data?.message || "Unable to load documents for this container.");
      })
      .finally(() => { if (isMounted) setIsLoadingDocuments(false); });
    return () => { isMounted = false; };
  }, [selectedContainerId]);

  const documentsByType = useMemo(() => new Map(documents.map((document) => [document.documentType, document])), [documents]);
  const hasAllUploadedDocuments = documentTypes.every((type) => {
    const document = documentsByType.get(type);
    return Number.isInteger(document?.latestVersion) && document.latestVersion > 0 && Boolean(document.latestVersionDetails);
  });
  const hasRejectedDocument = documents.some((document) => document.reviewStatus === "REJECTED");
  const canSubmitForReview = canUpload && selectedContainer?.currentStage === "ARRIVED" && hasAllUploadedDocuments;

  // Expand a document and lazily fetch its version history through the protected API.
  async function toggleVersions(document) {
    if (expandedDocumentId === document._id) {
      setExpandedDocumentId("");
      return;
    }
    setExpandedDocumentId(document._id);
    if (versionsByDocument[document._id]) return;
    try {
      const response = await api.get(`/document-versions/${document._id}`);
      setVersionsByDocument((current) => ({
        ...current,
        [document._id]: Array.isArray(response.data?.versions) ? response.data.versions : [],
      }));
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to load document versions.");
    }
  }

  // Download a private document through Axios so the existing Bearer token is used.
  async function downloadVersion(version) {
    try {
      const response = await api.get(`/document-versions/${version._id}/download`, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = version.fileName || "document";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to download this document.");
    }
  }

  // Upload a selected file using the backend's multipart field names and reservation route.
  async function handleUpload(event) {
    event.preventDefault();
    if (!selectedContainerId || !uploadFile || isUploading) return;
    const formData = new FormData();
    formData.append("documentType", uploadType);
    formData.append("file", uploadFile);
    setIsUploading(true);
    setUploadProgress(0);
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.post(`/document-versions/${selectedContainerId}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        },
      });
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      setSuccessMessage(response.data?.message || "Document uploaded successfully.");
      await loadDocuments();
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to upload this document.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }

  // Review only the latest version through the Customs Officer endpoint.
  async function handleReview(status) {
    if (!reviewTarget || isReviewing) return;
    if (status === "REJECTED" && reviewReason.trim().length < 10) return;
    setIsReviewing(true);
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.patch(`/documents/${reviewTarget.document._id}/review`, {
        versionNumber: reviewTarget.version.versionNumber,
        status,
        ...(status === "REJECTED" ? { rejectionReason: reviewReason.trim() } : {}),
      });
      setSuccessMessage(response.data?.message || `Document ${status.toLowerCase()} successfully.`);
      setReviewTarget(null);
      setReviewReason("");
      await loadDocuments();
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to review this document.");
    } finally {
      setIsReviewing(false);
    }
  }

  // Return a rejected Customs Review case using its existing stage endpoint and required reason.
  async function handleReturnForCorrections(event) {
    event.preventDefault();
    if (!selectedContainerId || returnReason.trim().length < 10 || isReturning) return;
    setIsReturning(true);
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.patch(`/containers/${selectedContainerId}/stage`, {
        toStage: "DOCUMENTS_SUBMITTED",
        reason: returnReason.trim(),
      });
      setSuccessMessage(response.data?.message || "Container returned for document corrections.");
      setReturnReason("");
      await Promise.all([loadDocuments(), reloadContainers()]);
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to return this container for corrections.");
    } finally {
      setIsReturning(false);
    }
  }

  // Refresh the role-scoped container list after a clearance stage changes.
  async function reloadContainers() {
    const response = await api.get("/containers", { params: isCustomsOfficer ? { stage: "CUSTOMS_REVIEW" } : {} });
    const records = Array.isArray(response.data?.containers) ? response.data.containers : [];
    setContainers(records);
    if (!records.some((container) => container._id === selectedContainerId)) {
      if (records.length === 0) setDocuments([]);
      if (records[0]?._id) setIsLoadingDocuments(true);
      setSelectedContainerId(records[0]?._id || "");
    }
  }

  // Submit complete initial document sets through the existing guarded stage transition.
  async function submitDocuments() {
    if (!canSubmitForReview) return;
    if (!window.confirm(`Submit the required documents for ${selectedContainer.containerNumber} to Customs Review?`)) return;
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.patch(`/containers/${selectedContainerId}/stage`, { toStage: "DOCUMENTS_SUBMITTED" });
      setSuccessMessage(response.data?.message || "Documents submitted for Customs review.");
      await Promise.all([loadDocuments(), reloadContainers()]);
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to submit documents for review.");
    }
  }

  const pageTitle = isCustomsOfficer ? "Document Reviews" : "Documents";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">Clearance workspace</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">{pageTitle}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{isCustomsOfficer ? "Review the latest submitted document versions for containers currently in Customs Review." : "View role-authorized container documents, upload permitted versions, and track review results."}</p>
      </header>

      {successMessage && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">{successMessage}</p>}
      {pageError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">{pageError}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {isLoadingContainers ? <p className="text-sm text-slate-500" role="status">Loading authorized containers…</p> : containers.length === 0 ? <p className="text-sm text-slate-600">{isCustomsOfficer ? "No containers are currently in CUSTOMS_REVIEW." : "No containers are available for your account."}</p> : <label className="block max-w-2xl text-sm font-bold text-slate-700">Select container<select value={selectedContainerId} onChange={(event) => { setIsLoadingDocuments(true); setSelectedContainerId(event.target.value); setSearchParams(event.target.value ? { container: event.target.value } : {}, { replace: true }); setDocuments([]); setVersionsByDocument({}); setSuccessMessage(""); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="">Choose a container</option>{containers.map((container) => <option key={container._id} value={container._id}>{container.containerNumber} · {container.currentStage}{getPortName(container.billOfLading?.port) ? ` · ${getPortName(container.billOfLading?.port)}` : ""}</option>)}</select></label>}
      </section>

      {selectedContainer && <>
        <section className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5"><div><p className="text-xs font-bold text-slate-500">Selected container</p><h2 className="mt-1 text-lg font-black text-[#172554]">{selectedContainer.containerNumber}</h2><p className="mt-1 text-sm text-slate-600">{getPortName(selectedContainer.billOfLading?.port) || "Port not available"} · Stage: <span className="font-bold">{selectedContainer.currentStage}</span></p></div>{canSubmitForReview && <button type="button" onClick={submitDocuments} className="rounded-xl bg-[#2B4593] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#21377a]">Submit documents for review</button>}</section>

        {canUpload && ["ARRIVED", "DOCUMENTS_SUBMITTED"].includes(selectedContainer.currentStage) && <form onSubmit={handleUpload} className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end sm:p-5">
          <label className="text-sm font-bold text-slate-700">Document type<select value={uploadType} onChange={(event) => setUploadType(event.target.value)} disabled={isUploading} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">{documentTypes.map((type) => <option key={type} value={type}>{documentLabels[type]}</option>)}</select></label>
          <label className="text-sm font-bold text-slate-700">File (PDF, JPG, or PNG; maximum 5 MB)<input ref={uploadInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} disabled={isUploading} required className="mt-2 block w-full rounded-xl border border-slate-200 bg-white text-sm file:mr-3 file:border-0 file:bg-white file:px-3 file:py-3" /></label>
          <button type="submit" disabled={isUploading || !uploadFile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"><FaUpload /> {isUploading ? `Uploading ${uploadProgress ?? 0}%` : "Upload version"}</button>
          {isUploading && <div className="h-2 overflow-hidden rounded-full bg-blue-100 sm:col-span-3"><div className="h-full bg-[#2B4593] transition-all" style={{ width: `${uploadProgress ?? 0}%` }} /></div>}
          <p className="text-xs leading-5 text-slate-600 sm:col-span-3">The existing server upload reservation, file validation, and versioning logic remains in control of every upload.</p>
        </form>}

        {isCustomsOfficer && selectedContainer.currentStage === "CUSTOMS_REVIEW" && hasRejectedDocument && <form onSubmit={handleReturnForCorrections} className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-sm font-bold text-amber-950">Reason for returning the container to DOCUMENTS_SUBMITTED<textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} minLength={10} required rows={2} className="mt-2 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm" placeholder="At least 10 characters" /></label><button type="submit" disabled={isReturning || returnReason.trim().length < 10} className="rounded-xl bg-amber-800 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">{isReturning ? "Returning…" : "Return for corrections"}</button><p className="text-xs leading-5 text-amber-900 sm:col-span-2">The review endpoint records the rejection; this separate action uses the existing Customs Officer stage transition and creates its clearance event.</p></form>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5"><h2 className="font-extrabold text-[#172554]">Required documents</h2><p className="mt-1 text-xs text-slate-500">Missing records are shown from the four document types defined by the backend model.</p></div>
          {isLoadingDocuments ? <p className="p-10 text-center text-sm text-slate-500" role="status">Loading documents…</p> : <div className="divide-y divide-slate-100">{documentTypes.map((type) => {
            const item = documentsByType.get(type);
            const latest = item?.latestVersionDetails;
            const canReviewLatest = isCustomsOfficer && selectedContainer.currentStage === "CUSTOMS_REVIEW" && item && latest && item.reviewStatus === "PENDING" && latest.reviewStatus === "PENDING" && latest.versionNumber === item.latestVersion;
            return <article key={type} className="p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2B4593]"><FaFileLines /></span><div><h3 className="font-extrabold text-[#172554]">{documentLabels[type]}</h3><p className="mt-1 text-xs text-slate-500">{item ? `Version ${item.latestVersion || 0} · Submitted ${formatDate(latest?.uploadedAt || item.updatedAt)}` : "Not uploaded"}</p></div></div>
                <div className="mt-3 flex flex-wrap items-center gap-2 lg:ml-[52px]"><StatusBadge status={item?.reviewStatus || "MISSING"} />{latest && latest.reviewStatus !== item?.reviewStatus && <span className="text-xs text-slate-500">Latest version: {latest.reviewStatus}</span>}{item?.rejectionReason && <span className="text-xs font-semibold text-rose-700">Reason: {item.rejectionReason}</span>}{latest?.fileName && <span className="max-w-full truncate text-xs text-slate-500">{latest.fileName}</span>}</div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">{item && <button type="button" onClick={() => void toggleVersions(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{expandedDocumentId === item._id ? "Hide versions" : "Versions"}</button>}{canReviewLatest && <><button type="button" onClick={() => setReviewTarget({ document: item, version: latest })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">Approve latest</button><button type="button" onClick={() => { setReviewReason(""); setReviewTarget({ document: item, version: latest }); }} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800">Reject latest</button></>}</div>
              </div>
              {expandedDocumentId === item?._id && <VersionList versions={versionsByDocument[item._id]} onDownload={downloadVersion} />}
            </article>;
          })}</div>}
        </section>
        {canUpload && <p className="text-xs leading-5 text-slate-500">Upload is enabled only during ARRIVED or DOCUMENTS_SUBMITTED. The backend decides whether the signed-in importer owns the container or the clearing agent is assigned to it.</p>}
      </>}

      {reviewTarget && <ReviewDialog target={reviewTarget} reason={reviewReason} setReason={setReviewReason} isSaving={isReviewing} onCancel={() => !isReviewing && setReviewTarget(null)} onReview={handleReview} />}
    </div>
  );
}

// Show document review state using the statuses returned by Document and DocumentVersion.
function StatusBadge({ status }) {
  const tone = status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : status === "REJECTED" ? "bg-rose-50 text-rose-700" : status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600";
  const label = status === "MISSING" ? "Not uploaded" : status;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

// Render version history without exposing the server's private storage path.
function VersionList({ versions, onDownload }) {
  if (!versions) return <p className="mt-4 text-sm text-slate-500" role="status">Loading versions…</p>;
  if (versions.length === 0) return <p className="mt-4 text-sm text-slate-500">No uploaded versions.</p>;
  return <ol className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3">{versions.map((version) => <li key={version._id} className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-bold text-slate-800">Version {version.versionNumber} · {version.fileName}</p><p className="text-xs text-slate-500">{formatDate(version.createdAt)} · Uploaded by {version.uploadedBy?.fullName || "—"} · <span className="font-semibold">{version.reviewStatus}</span></p>{version.rejectionReason && <p className="mt-1 text-xs text-rose-700">Reason: {version.rejectionReason}</p>}</div><button type="button" onClick={() => void onDownload(version)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#2B4593] hover:bg-blue-50"><FaDownload /> Download</button></li>)}</ol>;
}

// Collect the written reason required for a Customs rejection.
function ReviewDialog({ target, reason, setReason, isSaving, onCancel, onReview }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#0b1738]/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"><button type="button" onClick={onCancel} className="absolute inset-0 cursor-default" aria-label="Close review dialog" /><section role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" className="relative z-10 w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><h2 id="review-dialog-title" className="text-xl font-black text-[#172554]">Review {documentLabels[target.document.documentType]}</h2><p className="mt-1 text-sm text-slate-600">Latest version {target.version.versionNumber}: {target.version.fileName}</p><p className="mt-3 text-sm leading-6 text-slate-600">Download and inspect the submitted file before approving or rejecting it.</p><label className="mt-5 block text-sm font-bold text-slate-700">Rejection reason (required for rejection)<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="At least 10 characters" /></label><div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={isSaving} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">Cancel</button><button type="button" onClick={() => onReview("REJECTED")} disabled={isSaving || reason.trim().length < 10} className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">Reject document</button><button type="button" onClick={() => onReview("APPROVED")} disabled={isSaving} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">Approve document</button></div></section></div>;
}

export default DocumentsPage;
