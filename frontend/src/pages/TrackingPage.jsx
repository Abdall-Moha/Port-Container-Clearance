import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FaCalculator,
  FaCheck,
  FaClipboardCheck,
  FaClock,
  FaCreditCard,
  FaFileCircleCheck,
  FaMagnifyingGlass,
  FaShip,
  FaTruck,
  FaTriangleExclamation,
  FaUnlock,
} from "react-icons/fa6";
import api from "../config/api.js";

const clearanceStages = [
  { value: "ARRIVED", label: "Arrived", icon: FaShip },
  { value: "DOCUMENTS_SUBMITTED", label: "Documents submitted", icon: FaFileCircleCheck },
  { value: "CUSTOMS_REVIEW", label: "Customs review", icon: FaMagnifyingGlass },
  { value: "DUTY_ASSESSED", label: "Duty assessed", icon: FaCalculator },
  { value: "DUTY_PAID", label: "Duty paid", icon: FaCreditCard },
  { value: "INSPECTION", label: "Inspection", icon: FaClipboardCheck },
  { value: "RELEASED", label: "Released", icon: FaUnlock },
  { value: "COLLECTED", label: "Collected", icon: FaTruck },
];

const progressWidths = [
  "w-0", "w-[12.5%]", "w-1/4", "w-[37.5%]", "w-1/2",
  "w-[62.5%]", "w-3/4", "w-[87.5%]", "w-full",
];

const letterValues = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19,
  J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29,
  S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

// Validate container number structure and its ISO 6346 check digit.
function isValidContainerNumber(value) {
  if (!/^[A-Z]{4}[0-9]{7}$/.test(value)) return false;

  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const character = value[index];
    const numericValue = Number.isNaN(Number(character))
      ? letterValues[character]
      : Number(character);
    sum += numericValue * 2 ** index;
  }

  const remainder = sum % 11;
  const checkDigit = remainder === 10 ? 0 : remainder;
  return checkDigit === Number(value[10]);
}

// Format a supplied timestamp and leave absent milestone dates blank.
function formatDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// Show the public progress summary and stage timeline returned by the API.
function TrackingResult({ container }) {
  const completedStages = new Set(
    (container.completedStages || []).map((stage) => stage.stage),
  );
  const completedCount = clearanceStages.filter((stage) => completedStages.has(stage.value)).length;
  const currentStage = clearanceStages.find((stage) => stage.value === container.currentStage);
  const demurrage = container.demurrage || {};
  const feeValue = demurrage.estimatedFee;
  const hasFee = (typeof feeValue === "number" ||
    (typeof feeValue === "string" && feeValue.trim() !== "")) &&
    Number.isFinite(Number(feeValue)) && Number(feeValue) >= 0;

  return (
    <section className="mt-8 space-y-6" aria-live="polite">
      {container.releaseOrderStatus === "REVOKED" && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-rose-900"><FaTriangleExclamation className="mt-0.5 shrink-0 text-rose-700" /><div><p className="font-extrabold text-rose-800">Release Order Revoked</p><p className="mt-1 text-sm">This release order is no longer valid for collection.</p></div></div>}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#172554] via-[#1e3471] to-[#2B4593] text-white shadow-xl shadow-blue-950/15">
        <div className="p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-200">Container number</p>
              <h2 className="mt-2 text-2xl font-black tracking-wide sm:text-3xl">{container.containerNumber}</h2>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur">
              {currentStage && <currentStage.icon className="text-blue-200" />}
              Current stage: {currentStage?.label || container.currentStage}
            </div>
          </div>
          <div className="mt-8">
            <div className="mb-2 flex justify-between gap-3 text-sm">
              <span className="font-semibold text-blue-100">Clearance progress</span>
              <span className="font-extrabold text-white">{completedCount} of {clearanceStages.length} stages</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Completed clearance stages" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={clearanceStages.length}>
              <div className={`h-full rounded-full bg-cyan-300 transition-all duration-700 motion-reduce:transition-none ${progressWidths[completedCount] || "w-0"}`} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.04] sm:p-8">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2B4593]">Progress history</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[#172554]">Clearance timeline</h2>
          </div>
          <p className="text-sm text-slate-500">Completed milestones include their recorded time.</p>
        </div>

        <ol className="relative mt-8 space-y-3 before:absolute before:bottom-7 before:left-5 before:top-7 before:w-px before:bg-slate-200 sm:space-y-4">
          {clearanceStages.map((stage, index) => {
            const StageIcon = stage.icon;
            const isCurrent = stage.value === container.currentStage;
            const isCompleted = completedStages.has(stage.value);
            const timestamp = (container.completedStages || []).find((item) => item.stage === stage.value)?.completedAt;
            const formattedDate = formatDate(timestamp);
            const stateStyles = isCurrent
              ? "border-blue-200 bg-blue-50 text-[#2B4593] shadow-sm shadow-blue-950/5"
              : isCompleted
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-400";

            return (
              <li key={stage.value} className="relative flex gap-4 sm:gap-5">
                <span className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-4 border-white text-sm ${stateStyles}`}>
                  {isCompleted && !isCurrent ? <FaCheck className="text-xs" /> : <StageIcon className="text-sm" />}
                </span>
                <div className={`mb-1 min-w-0 flex-1 rounded-2xl border px-4 py-3.5 transition-colors duration-200 sm:px-5 ${stateStyles}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black tracking-[0.16em] opacity-60">{String(index + 1).padStart(2, "0")}</span>
                      <h3 className="text-sm font-extrabold">{stage.label}</h3>
                      {isCurrent && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#2B4593]">Current</span>}
                    </div>
                    {formattedDate && <time className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><FaClock className="text-[10px]" />{formattedDate}</time>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/80 p-5 shadow-sm shadow-slate-900/[0.04] sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-lg text-[#2B4593]"><FaClock /></span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2B4593]">Time at the port</p>
            <h2 className="mt-1 text-xl font-black text-[#172554]">Demurrage information</h2>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Free days" value={demurrage.freeDays} />
          <Metric label="Elapsed days" value={demurrage.elapsedDays} />
          <Metric label="Chargeable days" value={demurrage.chargeableDays} />
          {hasFee && <Metric label="Estimated fee" value={demurrage.estimatedFee} />}
        </div>
        {!hasFee && (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            The demurrage rate is not configured, so an estimated fee is not available. Chargeable days are shown for reference.
          </p>
        )}
        {demurrage.collectedAt && <p className="mt-4 text-sm text-slate-500">Demurrage period ended: {formatDate(demurrage.collectedAt)}</p>}
      </div>
    </section>
  );
}

// Render one demurrage value in a consistent summary tile.
function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-black text-[#172554]">{value ?? "—"}</p>
    </div>
  );
}

// Look up a container and distinguish invalid ISO numbers from missing records.
function TrackingPage() {
  const [searchParams] = useSearchParams();
  const qrContainerNumber = searchParams.get("containerNumber") || "";
  const [containerNumber, setContainerNumber] = useState(qrContainerNumber.toUpperCase());
  const [container, setContainer] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRequest = useRef(false);

  // Validate a number and retrieve its public clearance progress.
  const findContainer = useCallback(async (containerValue) => {
    if (loadingRequest.current) return;
    loadingRequest.current = true;

    const normalizedNumber = containerValue.trim().toUpperCase();
    setContainerNumber(normalizedNumber);
    setContainer(null);
    setErrorMessage("");
    setNotFound(false);

    if (!isValidContainerNumber(normalizedNumber)) {
      setErrorMessage("Invalid container number. Enter a valid ISO 6346 container number.");
      loadingRequest.current = false;
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.get("/containers/track", {
        params: { containerNumber: normalizedNumber },
      });
      setContainer(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        setNotFound(true);
        setErrorMessage("Not Found");
      } else {
        setErrorMessage(error.response?.data?.message || "Tracking is temporarily unavailable. Please try again.");
      }
    } finally {
      loadingRequest.current = false;
      setIsLoading(false);
    }
  }, []);

  // Automatically load the container encoded in the Release Order QR link.
  useEffect(() => {
    if (!qrContainerNumber.trim()) return undefined;
    const requestId = window.setTimeout(() => void findContainer(qrContainerNumber), 0);
    return () => window.clearTimeout(requestId);
  }, [findContainer, qrContainerNumber]);

  // Submit the number entered into the public lookup form.
  async function handleSubmit(event) {
    event.preventDefault();
    await findContainer(containerNumber);
  }

  // Clear an old lookup result when the visitor edits the container number.
  function handleInputChange(event) {
    setContainerNumber(event.target.value.toUpperCase());
    setContainer(null);
    setErrorMessage("");
    setNotFound(false);
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-b from-blue-50/70 via-slate-50 to-white">
      <div className="pointer-events-none absolute -left-40 top-20 size-96 rounded-full bg-blue-100/50 blur-3xl" />
      <div className="relative mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-xl text-[#2B4593] shadow-lg shadow-blue-950/10 ring-1 ring-blue-100"><FaMagnifyingGlass /></span>
          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.18em] text-[#2B4593]">Public container tracking</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-[#172554] sm:text-4xl lg:text-5xl">Where is your container in the process?</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">Enter the container number to see its current clearance stage and recorded milestones.</p>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto mt-9 flex max-w-3xl flex-col gap-3 rounded-2xl border border-white bg-white/90 p-3 shadow-xl shadow-blue-950/[0.08] ring-1 ring-slate-200/80 backdrop-blur sm:flex-row sm:rounded-3xl sm:p-4">
          <label className="sr-only" htmlFor="container-number">Container number</label>
          <div className="relative min-w-0 flex-1">
            <FaShip className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="container-number"
              name="containerNumber"
              type="text"
              value={containerNumber}
              onChange={handleInputChange}
              placeholder="Enter container number"
              autoComplete="off"
              maxLength={11}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 font-bold uppercase tracking-wider text-[#172554] outline-none transition placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#2B4593] focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-6 py-3.5 font-extrabold text-white shadow-md shadow-blue-950/15 transition duration-200 hover:-translate-y-0.5 hover:bg-[#21377a] hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
          >
            {isLoading ? <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" /> Searching…</> : <>Track Container <FaMagnifyingGlass className="transition-transform group-hover:scale-110 motion-reduce:transform-none" /></>}
          </button>
        </form>

        {errorMessage && (
          notFound ? (
            <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm" role="alert">
              <h2 className="text-xl font-black text-[#172554]">Not Found</h2>
            </div>
          ) : (
            <p className="mx-auto mt-5 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-semibold text-rose-800" role="alert">{errorMessage}</p>
          )
        )}
        {isLoading && <p className="mt-6 text-center text-sm font-semibold text-slate-500" role="status">Retrieving the latest clearance progress…</p>}
        {container && <TrackingResult container={container} />}
        <p className="mt-8 text-center text-xs leading-5 text-slate-500">This public page does not show personal details, documents, payment data, or Gate Codes.</p>
      </div>
    </div>
  );
}

export default TrackingPage;
