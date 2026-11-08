import { useCallback, useEffect, useMemo, useState } from "react";
import { FaCalculator, FaMagnifyingGlass, FaRotate } from "react-icons/fa6";
import api from "../config/api.js";

// Format persisted currency values without recalculating the assessment.
function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
    : "—";
}

// Format saved assessment and payment timestamps for the officer.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// Load the existing stage lists and their authorized payment histories.
async function loadAssessmentRecords() {
  const response = await api.get("/containers");
  const containers = (response.data?.containers || []).filter((container) => container.dutyAssessment);
  const results = await Promise.allSettled(containers.map(async (container) => {
    const response = await api.get(`/payments/container/${container._id}`);
    return [container._id, response.data?.payments || []];
  }));
  const paymentsByContainer = {};
  let hadHistoryErrors = false;
  results.forEach((result) => {
    if (result.status === "fulfilled") paymentsByContainer[result.value[0]] = result.value[1];
    else hadHistoryErrors = true;
  });
  return { containers, paymentsByContainer, hadHistoryErrors };
}

// Resolve port IDs from the existing authorized ports list for display only.
async function loadPortNames() {
  const response = await api.get("/ports");
  return Object.fromEntries((response.data?.ports || []).map((port) => [String(port._id), port.name]));
}

// Show the original duty assessment snapshots for Customs Officers.
function DutyAssessmentsPage() {
  const [containers, setContainers] = useState([]);
  const [paymentsByContainer, setPaymentsByContainer] = useState({});
  const [portNamesById, setPortNamesById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");

  // Refresh the persisted snapshots and their payment/receipt records.
  const refresh = useCallback(async () => {
    try {
      setErrorMessage("");
      const data = await loadAssessmentRecords();
      setContainers(data.containers);
      setPaymentsByContainer(data.paymentsByContainer);
      try { setPortNamesById(await loadPortNames()); } catch { /* Port labels are optional to the saved assessment view. */ }
      if (data.hadHistoryErrors) setErrorMessage("Some payment histories could not be loaded. Refresh to try again.");
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to load duty assessments.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadAssessmentRecords()
      .then((data) => {
        if (!isMounted) return;
        setContainers(data.containers);
        setPaymentsByContainer(data.paymentsByContainer);
        loadPortNames().then((names) => { if (isMounted) setPortNamesById(names); }).catch(() => {});
        if (data.hadHistoryErrors) setErrorMessage("Some payment histories could not be loaded. Refresh to try again.");
      })
      .catch((error) => {
        if (isMounted) setErrorMessage(error.response?.data?.message || "Unable to load duty assessments.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const visibleContainers = useMemo(() => {
    const text = search.trim().toLowerCase();
    return containers.filter((container) => {
      const matchesStage = stageFilter === "ALL" || (stageFilter === "HISTORICAL"
        ? !["DUTY_ASSESSED", "DUTY_PAID"].includes(container.currentStage)
        : container.currentStage === stageFilter);
      const matchesSearch = !text || [container.containerNumber, container.importer?.fullName, container.billOfLading?.blNumber, container.hsCode]
        .some((value) => String(value || "").toLowerCase().includes(text));
      return matchesStage && matchesSearch;
    });
  }, [containers, search, stageFilter]);

  return (
    <main className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">Customs workspace</p><h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">Duty Assessments</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review the saved assessment details and payment status. Amounts below are the original assessment snapshots.</p></div>
        <button type="button" onClick={() => { setIsRefreshing(true); void refresh(); }} disabled={isRefreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><FaRotate className={isRefreshing ? "animate-spin" : ""} /> Refresh</button>
      </header>
      {errorMessage && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{errorMessage}</p>}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block"><span className="sr-only">Search assessments</span><FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search container, importer, B/L, HS code" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 sm:w-80" /></label>
        <div className="flex flex-wrap gap-2" aria-label="Assessment stage filter">{[["ALL", "All"], ["DUTY_ASSESSED", "Awaiting payment"], ["DUTY_PAID", "Paid"], ["HISTORICAL", "Later stages"]].map(([value, label]) => <button key={value} type="button" onClick={() => setStageFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-extrabold transition ${stageFilter === value ? "bg-[#2B4593] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}</div>
      </section>
      {isLoading ? <p role="status" className="rounded-2xl bg-white p-12 text-center text-sm font-semibold text-slate-500">Loading saved assessments…</p> : containers.length === 0 ? <EmptyState text="Assessments appear here after Customs completes a duty assessment." /> : visibleContainers.length === 0 ? <p className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">No assessments match this search or filter.</p> : <section className="space-y-4">{visibleContainers.map((container) => <AssessmentCard key={container._id} container={container} payments={paymentsByContainer[container._id] || []} portNamesById={portNamesById} />)}</section>}
    </main>
  );
}

// Present the exact saved snapshot and associated payment receipt.
function AssessmentCard({ container, payments, portNamesById }) {
  const assessment = container.dutyAssessment || {};
  const successfulPayment = payments.find((payment) => payment.status === "SUCCESS");
  const latestPayment = payments[0];
  const port = container.billOfLading?.port;
  const portName = typeof port === "object" ? port?.name : portNamesById[String(port || "")] || "—";
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Container</p><h2 className="mt-1 text-xl font-black text-[#172554]">{container.containerNumber}</h2><p className="mt-1 text-sm text-slate-600">{container.importer?.fullName || "Importer unavailable"} · {container.billOfLading?.blNumber || "No B/L"}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-xs font-extrabold ${container.currentStage === "DUTY_PAID" ? "bg-emerald-100 text-emerald-800" : container.currentStage === "DUTY_ASSESSED" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{container.currentStage.replaceAll("_", " ")}</span></header>
    <div className="grid gap-x-8 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
      <Detail label="Port" value={portName} /><Detail label="Container size" value={container.size} /><Detail label="HS Code" value={container.hsCode} /><Detail label="HS Chapter" value={assessment.hsChapter} /><Detail label="CIF value" value={formatMoney(assessment.cifValue)} /><Detail label="Applied duty" value={`${assessment.dutyPercentage ?? "—"}%`} /><Detail label="Calculated duty amount" value={formatMoney(Number(assessment.cifValue || 0) * Number(assessment.dutyPercentage || 0) / 100)} /><Detail label="Fixed port fee" value={formatMoney(assessment.portFee)} /><Detail label="Total assessed amount" value={formatMoney(assessment.amount)} emphasis /><Detail label="Assessment date" value={formatDate(assessment.assessedAt)} /><Detail label="Assessed by" value={assessment.assessedBy?.fullName || "Officer information unavailable"} /><Detail label="Payment status" value={successfulPayment ? "Successful" : latestPayment?.status || (container.currentStage === "DUTY_PAID" ? "Successful" : "Not paid")} />
      {successfulPayment && <Detail label="Receipt number" value={successfulPayment.receiptNumber || "Receipt being finalized"} emphasis />}
      {successfulPayment && <Detail label="Paid on" value={formatDate(successfulPayment.paidAt)} />}
    </div>
  </article>;
}

// Display one labeled field from the saved record.
function Detail({ label, value, emphasis = false }) {
  return <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 break-words text-sm ${emphasis ? "font-extrabold text-[#172554]" : "font-semibold text-slate-700"}`}>{value ?? "—"}</p></div>;
}

// Explain when no duty assessment records are currently available.
function EmptyState({ text }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-14 text-center"><FaCalculator className="mx-auto text-2xl text-slate-300" /><h2 className="mt-3 font-extrabold text-[#172554]">No saved assessments yet</h2><p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{text}</p></div>;
}

export default DutyAssessmentsPage;
