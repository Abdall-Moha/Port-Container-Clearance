import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaClock,
  FaCreditCard,
  FaMagnifyingGlass,
  FaReceipt,
  FaRotate,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

const providerOptions = [
  { value: "EVC_PLUS", label: "EVC Plus" },
  { value: "ZAAD", label: "Zaad" },
  { value: "EDAHAB", label: "eDahab" },
];

// Format the saved assessment or payment amount in USD.
function formatUsd(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
    : "—";
}

// Format a date returned by the payment API without inventing a value.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// Retrieve role-scoped payable containers and their authorized payment histories.
async function fetchPaymentData() {
  const [assessedResponse, paidResponse] = await Promise.all([
    api.get("/containers", { params: { stage: "DUTY_ASSESSED" } }),
    api.get("/containers", { params: { stage: "DUTY_PAID" } }),
  ]);
  const records = [
    ...(Array.isArray(assessedResponse.data?.containers) ? assessedResponse.data.containers : []),
    ...(Array.isArray(paidResponse.data?.containers) ? paidResponse.data.containers : []),
  ];
  const historyResults = await Promise.allSettled(
    records.map(async (container) => {
      const response = await api.get(`/payments/container/${container._id}`);
      return [container._id, Array.isArray(response.data?.payments) ? response.data.payments : []];
    }),
  );
  const histories = {};
  let historyFailed = false;
  historyResults.forEach((result) => {
    if (result.status === "fulfilled") histories[result.value[0]] = result.value[1];
    else historyFailed = true;
  });
  return { records, histories, historyFailed };
}

// Show the Importer or Clearing Agent's authorized payment containers and receipts.
function PaymentsPage() {
  const { user } = useAuth();
  const [containers, setContainers] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState({});
  const [ports, setPorts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");
  const [payingContainer, setPayingContainer] = useState(null);
  const [provider, setProvider] = useState(providerOptions[0].value);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentResult, setPaymentResult] = useState(null);

  // Load only payable and already-paid containers plus their access-controlled histories.
  const loadPayments = useCallback(async () => {
    try {
      const { records, histories, historyFailed } = await fetchPaymentData();
      setContainers(records);
      setPaymentHistory(histories);
      setPageError(historyFailed ? "Some payment histories could not be loaded. Refresh to try again." : "");
    } catch (error) {
      setPageError(error.response?.data?.message || "Unable to load your payment containers.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load authorized container data and port names when the page opens.
  useEffect(() => {
    let isMounted = true;

    fetchPaymentData()
      .then(({ records, histories, historyFailed }) => {
        if (!isMounted) return;
        setContainers(records);
        setPaymentHistory(histories);
        setPageError(historyFailed ? "Some payment histories could not be loaded. Refresh to try again." : "");
      })
      .catch((error) => {
        if (isMounted) setPageError(error.response?.data?.message || "Unable to load your payment containers.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    api.get("/ports")
      .then((response) => {
        if (isMounted) setPorts(Array.isArray(response.data?.ports) ? response.data.ports : []);
      })
      .catch(() => {
        // Payment actions remain available if optional port labels are unavailable.
      });

    return () => {
      isMounted = false;
    };
  }, [loadPayments]);

  const portNamesById = useMemo(() => new Map(ports.map((port) => [String(port._id), port.name])), [ports]);

  // Resolve a port ID in the Bill of Lading reference to its display name.
  function getPortName(portValue) {
    if (portValue && typeof portValue === "object") {
      return portValue.name || portNamesById.get(String(portValue._id)) || "Port information unavailable";
    }
    return portNamesById.get(String(portValue || "")) || "Port information unavailable";
  }

  const visibleContainers = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    if (!searchText) return containers;
    return containers.filter((container) => [
      container.containerNumber,
      container.billOfLading?.blNumber,
      container.currentStage,
    ].some((value) => String(value || "").toLowerCase().includes(searchText)));
  }, [containers, search]);

  const assessedCount = containers.filter((container) => container.currentStage === "DUTY_ASSESSED").length;
  const paidCount = containers.filter((container) => container.currentStage === "DUTY_PAID").length;

  // Open payment details and reuse original details if a pending operation can be resumed.
  function openPayment(container) {
    const pendingPayment = (paymentHistory[container._id] || []).find((payment) => payment.status === "PENDING");
    setPayingContainer(container);
    setProvider(pendingPayment?.provider || providerOptions[0].value);
    setPhoneNumber(pendingPayment?.phoneNumber || user?.phone || "");
    setIsConfirming(false);
    setPaymentError("");
    setPaymentResult(null);
  }

  // Close the payment dialog when no payment request is being processed.
  function closePayment() {
    if (isPaying) return;
    setPayingContainer(null);
    setIsConfirming(false);
    setPaymentError("");
    setPaymentResult(null);
  }

  // Refresh the scoped container and payment history data after a payment result.
  async function handleRefresh() {
    setIsRefreshing(true);
    setPageError("");
    await loadPayments();
  }

  // Check the same phone format used by the existing payment route before confirmation.
  function continueToConfirmation(event) {
    event.preventDefault();
    if (!payingContainer) return;
    if (!/^\+?[0-9]{9,15}$/.test(phoneNumber.trim())) {
      setPaymentError("Enter a phone number containing 9 to 15 digits, with an optional leading +.");
      return;
    }
    setPaymentError("");
    setIsConfirming(true);
  }

  // Submit the exact backend payment fields and show its saved result and receipt.
  async function confirmPayment() {
    if (!payingContainer || isPaying || !isConfirming) return;
    setIsPaying(true);
    setPaymentError("");
    try {
      const response = await api.post(`/payments/${payingContainer._id}/pay`, {
        provider,
        phoneNumber: phoneNumber.trim(),
        confirmPayment: true,
      });
      setPaymentResult({ status: "SUCCESS", payment: response.data?.payment });
      setIsConfirming(false);
      await loadPayments();
    } catch (error) {
      const failedPayment = error.response?.data?.payment;
      if (failedPayment?.status === "FAILED") {
        setPaymentResult({ status: "FAILED", payment: failedPayment });
        setIsConfirming(false);
        await loadPayments();
      } else {
        setPaymentError(error.response?.data?.message || "Unable to process this payment. Please try again.");
      }
    } finally {
      setIsPaying(false);
    }
  }

  // Return to the editable payment form after showing a failed simulated attempt.
  function retryPayment() {
    setPaymentResult(null);
    setPaymentError("");
    setIsConfirming(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">Clearance workspace</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">Duty Payments</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review the assessed amount, pay through simulated mobile money, and view payment receipts for your authorized containers.</p>
        </div>
        <button type="button" onClick={() => void handleRefresh()} disabled={isRefreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><FaRotate className={isRefreshing ? "animate-spin" : ""} /> Refresh</button>
      </header>

      {pageError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">{pageError}</p>}

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Payment container totals">
        <SummaryCard label="Awaiting Payment" value={assessedCount} icon={FaClock} />
        <SummaryCard label="Payment Complete" value={paidCount} icon={FaReceipt} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.04]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><h2 className="font-extrabold text-[#172554]">Your payment containers</h2><p className="mt-1 text-xs text-slate-500">Only your own or assigned containers are returned by the backend.</p></div>
          <label className="relative block"><span className="sr-only">Search payment containers</span><FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search container or B/L" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 sm:w-64" /></label>
        </div>

        {isLoading ? (
          <p className="p-12 text-center text-sm font-semibold text-slate-500" role="status">Loading payment containers…</p>
        ) : containers.length === 0 ? (
          <EmptyState title="No containers awaiting or completing payment" text="Containers appear here after Customs assesses duty. Paid containers remain listed with their receipt." />
        ) : visibleContainers.length === 0 ? (
          <EmptyState title="No matching containers" text="Try a different container number, Bill of Lading, or stage." />
        ) : (
          <div className="divide-y divide-slate-100">{visibleContainers.map((container) => {
            const isPaid = container.currentStage === "DUTY_PAID";
            const history = paymentHistory[container._id] || [];
            const latestPayment = history[0];
            const successfulPayment = history.find((payment) => payment.status === "SUCCESS");
            const pendingPayment = history.find((payment) => payment.status === "PENDING");
            const assessment = container.dutyAssessment;
            return <article key={container._id} className="p-4 sm:p-6">
              <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                <div className="grid min-w-0 flex-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Container</p><h3 className="mt-1 text-lg font-black text-[#172554]">{container.containerNumber}</h3></div>
                  <Detail label="Bill of Lading" value={container.billOfLading?.blNumber || "—"} />
                  <Detail label="Port" value={getPortName(container.billOfLading?.port)} />
                  <Detail label="Container size" value={container.size || "—"} />
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Clearance stage</p><p className="mt-1"><StageBadge stage={container.currentStage} /></p></div>
                  <Detail label="Assessed duty amount" value={formatUsd(assessment?.amount)} emphasis />
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment status</p><p className="mt-1"><PaymentStatusBadge status={successfulPayment ? "SUCCESS" : pendingPayment ? "PENDING" : latestPayment?.status || (isPaid ? "SUCCESS" : "UNPAID")} /></p>
                    {latestPayment?.status === "FAILED" && <p className="mt-1 max-w-xs text-xs text-rose-700">{latestPayment.failureReason || "Last attempt failed. You can try again."}</p>}
                  </div>
                  {isPaid && <Detail label="Receipt number" value={successfulPayment?.receiptNumber || "Receipt is being finalized"} emphasis />}
                  {isPaid && successfulPayment && <Detail label="Paid on" value={formatDate(successfulPayment.paidAt)} />}
                </div>
                <div className="flex shrink-0 flex-col gap-2 xl:min-w-40">
                  {container.currentStage === "DUTY_ASSESSED" && <button type="button" onClick={() => openPayment(container)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a]"><FaCreditCard /> {pendingPayment ? "Resume Payment" : "Pay Duty"}</button>}
                  {isPaid && successfulPayment && <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-5 py-3 text-sm font-extrabold text-emerald-700"><FaCheck /> Paid</span>}
                </div>
              </div>
              {history.length > 0 && <details className="mt-5 rounded-xl border border-slate-100 bg-slate-50">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">Payment attempts and history ({history.length})</summary>
                <ul className="divide-y divide-slate-200 px-4">{history.map((payment) => <li key={payment._id} className="flex flex-col justify-between gap-2 py-3 text-sm sm:flex-row sm:items-center"><div><span className="font-bold text-slate-800">{providerLabel(payment.provider)} · {formatUsd(payment.amount)}</span><p className="mt-1 text-xs text-slate-500">{formatDate(payment.paidAt || payment.createdAt)} · {payment.phoneNumber}</p>{payment.failureReason && <p className="mt-1 text-xs font-semibold text-rose-700">{payment.failureReason}</p>}</div><div className="flex items-center gap-3"><PaymentStatusBadge status={payment.status} />{payment.receiptNumber && <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2B4593]"><FaReceipt /> {payment.receiptNumber}</span>}</div></li>)}</ul>
              </details>}
            </article>;
          })}</div>
        )}
      </section>

      {payingContainer && <PaymentModal
        container={payingContainer}
        hasPendingPayment={(paymentHistory[payingContainer._id] || []).some((payment) => payment.status === "PENDING")}
        provider={provider}
        setProvider={setProvider}
        phoneNumber={phoneNumber}
        setPhoneNumber={setPhoneNumber}
        isConfirming={isConfirming}
        isPaying={isPaying}
        error={paymentError}
        result={paymentResult}
        onClose={closePayment}
        onContinue={continueToConfirmation}
        onConfirm={() => void confirmPayment()}
        onBack={() => { setIsConfirming(false); setPaymentError(""); }}
        onRetry={retryPayment}
      />}
    </div>
  );
}

// Show a compact value with a label in each payment container card.
function Detail({ label, value, emphasis = false }) {
  return <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 break-words text-sm ${emphasis ? "font-extrabold text-[#172554]" : "font-semibold text-slate-700"}`}>{value}</p></div>;
}

// Display a summarized total from the role-scoped container list.
function SummaryCard({ label, value, icon: Icon }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]"><span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-lg text-[#2B4593]"><Icon /></span><div><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-[#172554]">{value}</p></div></div>;
}

// Make each clearance stage readable without changing its backend value.
function StageBadge({ stage }) {
  const labels = { DUTY_ASSESSED: "Duty assessed", DUTY_PAID: "Duty paid" };
  return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#2B4593]">{labels[stage] || stage}</span>;
}

// Present payment status with a distinct visual treatment for failures and success.
function PaymentStatusBadge({ status }) {
  const styles = {
    SUCCESS: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-rose-50 text-rose-700",
    PENDING: "bg-amber-50 text-amber-800",
    UNPAID: "bg-slate-100 text-slate-600",
  };
  const labels = { SUCCESS: "Paid", FAILED: "Failed", PENDING: "Processing", UNPAID: "Payment due" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status] || styles.UNPAID}`}>{labels[status] || status}</span>;
}

// Show an empty or filtered list without implying records exist.
function EmptyState({ title, text }) {
  return <div className="px-5 py-14 text-center"><FaCreditCard className="mx-auto text-2xl text-slate-300" /><h3 className="mt-3 font-extrabold text-[#172554]">{title}</h3><p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{text}</p></div>;
}

// Convert the backend provider enum into its human-readable label.
function providerLabel(value) {
  return providerOptions.find((option) => option.value === value)?.label || value || "Mobile money";
}

// Confirm and submit a simulated mobile money payment using backend-provided amounts.
function PaymentModal({ container, hasPendingPayment, provider, setProvider, phoneNumber, setPhoneNumber, isConfirming, isPaying, error, result, onClose, onContinue, onConfirm, onBack, onRetry }) {
  const assessment = container.dutyAssessment;
  const payment = result?.payment;
  const pendingResult = result?.status === "SUCCESS";

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1738]/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="payment-modal-title" className="relative max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
      <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-wider text-[#2B4593]">{pendingResult ? "Payment complete" : result ? "Payment result" : "Secure payment"}</p><h2 id="payment-modal-title" className="mt-1 text-xl font-black text-[#172554]">{pendingResult ? "Payment successful" : result ? "Payment failed" : isConfirming ? "Confirm payment" : "Pay duty"}</h2><p className="mt-1 text-sm text-slate-500">Container {container.containerNumber}</p></div><button type="button" onClick={onClose} disabled={isPaying} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Close payment dialog"><FaXmark /></button></header>

      {!result && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-extrabold text-[#172554]">Saved duty assessment</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><AssessmentDetail label="CIF value" value={formatUsd(assessment?.cifValue)} /><AssessmentDetail label="Duty percentage" value={`${assessment?.dutyPercentage ?? "—"}%`} /><AssessmentDetail label="Fixed port fee" value={formatUsd(assessment?.portFee)} /><AssessmentDetail label="Total amount due" value={formatUsd(assessment?.amount)} strong /></dl>
      </div>}

      {!result && !isConfirming && <form onSubmit={onContinue} className="mt-5 space-y-4">
        {hasPendingPayment && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">A previous payment is being finalized. Retry it with the original provider and phone number.</p>}
        <label className="block text-sm font-bold text-slate-700">Payment method<select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={hasPendingPayment} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100">{providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="block text-sm font-bold text-slate-700">Mobile money phone number<input type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+252XXXXXXXXX" required disabled={hasPendingPayment} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100" /><span className="mt-1 block text-xs font-normal text-slate-500">Enter 9 to 15 digits, with an optional leading +.</span></label>
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p>}
        <button type="submit" className="w-full rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a]">Review payment details</button>
      </form>}

      {!result && isConfirming && <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><h3 className="font-extrabold text-[#172554]">Please confirm these details</h3><dl className="mt-3 space-y-2 text-sm"><ReviewDetail label="Container" value={container.containerNumber} /><ReviewDetail label="Payment method" value={providerLabel(provider)} /><ReviewDetail label="Phone number" value={phoneNumber.trim()} /><ReviewDetail label="Amount due" value={formatUsd(assessment?.amount)} strong /></dl></div>
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={onBack} disabled={isPaying} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"><FaArrowLeft /> Change details</button><button type="button" onClick={onConfirm} disabled={isPaying} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">{isPaying ? "Processing payment…" : `Confirm and Pay ${formatUsd(assessment?.amount)}`}</button></div>
      </div>}

      {result && <div className={`mt-5 rounded-2xl border p-5 ${pendingResult ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
        <div className="flex items-start gap-3"><span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${pendingResult ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{pendingResult ? <FaCheck /> : <FaTriangleExclamation />}</span><div><h3 className={`font-extrabold ${pendingResult ? "text-emerald-900" : "text-rose-900"}`}>{pendingResult ? "Payment successful" : "Payment failed"}</h3><p className={`mt-1 text-sm ${pendingResult ? "text-emerald-800" : "text-rose-800"}`}>{pendingResult ? "The saved assessment amount was paid." : payment?.failureReason || "The mobile money payment could not be completed. The container remains awaiting payment."}</p></div></div>
        {payment && <dl className="mt-4 space-y-2 rounded-xl bg-white/70 p-4 text-sm"><ReviewDetail label="Container" value={container.containerNumber} /><ReviewDetail label="Payment method" value={providerLabel(payment.provider)} /><ReviewDetail label={pendingResult ? "Amount paid" : "Attempted amount"} value={formatUsd(payment.amount)} strong />{pendingResult && <><ReviewDetail label="Receipt number" value={payment.receiptNumber || "Being finalized"} /><ReviewDetail label="Payment date" value={formatDate(payment.paidAt)} /></>}</dl>}
        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{!pendingResult && <button type="button" onClick={onRetry} className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-800 hover:bg-rose-50">Try another payment</button>}<button type="button" onClick={onClose} className={`rounded-xl px-5 py-3 text-sm font-extrabold text-white ${pendingResult ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-700 hover:bg-slate-800"}`}>{pendingResult ? "Done" : "Close"}</button></div>
      </div>}
    </section>
  </div>;
}

// Display one saved assessment value in the payment summary.
function AssessmentDetail({ label, value, strong = false }) {
  return <div><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className={`mt-0.5 ${strong ? "font-black text-[#172554]" : "font-bold text-slate-700"}`}>{value}</dd></div>;
}

// Display a confirmed payment field in a readable label/value row.
function ReviewDetail({ label, value, strong = false }) {
  return <div className="flex justify-between gap-4"><dt className="text-slate-600">{label}</dt><dd className={`break-all text-right ${strong ? "font-black text-[#172554]" : "font-bold text-slate-800"}`}>{value}</dd></div>;
}

export default PaymentsPage;
