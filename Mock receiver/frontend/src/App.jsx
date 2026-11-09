import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowsRotate,
  FaCircleCheck,
  FaCircleXmark,
  FaClock,
  FaEye,
  FaXmark,
} from "react-icons/fa6";

const WEBHOOKS_URL = "http://localhost:5001/webhooks";

// Format stored event times for easy reading in the dashboard.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// Display an event stage while explaining the initial null stage clearly.
function displayStage(stage) {
  return stage || "Initial Event";
}

// Show the full details of one received event in a focused dialog.
function EventDetailsModal({ event, onClose }) {
  useEffect(() => {
    function closeOnEscape(keyboardEvent) {
      if (keyboardEvent.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const details = [
    ["Event ID", event.eventId],
    ["Container Number", event.containerNumber],
    ["From Stage", displayStage(event.fromStage)],
    ["To Stage", event.toStage],
    ["Event Time", formatDate(event.time)],
    ["Received At", formatDate(event.receivedAt)],
  ];

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="event-details-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              Received webhook
            </p>
            <h2
              id="event-details-title"
              className="mt-1 text-xl font-black text-slate-900"
            >
              Event details
            </h2>
          </div>
          <button
            aria-label="Close event details"
            className="flex size-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <FaXmark />
          </button>
        </header>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div className="min-w-0 rounded-xl bg-slate-50 p-4" key={label}>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {label}
              </dt>
              <dd className="mt-2 break-all text-sm font-semibold text-slate-900">
                {value || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

// Retrieve and present webhook events received by the local Mock Receiver.
function App() {
  const [events, setEvents] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const requestInProgress = useRef(false);
  const isMounted = useRef(false);

  // Load current server events and clear stale values when the receiver is unavailable.
  const refreshEvents = useCallback(async () => {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    if (isMounted.current) setIsLoading(true);

    try {
      const response = await fetch(WEBHOOKS_URL, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`The receiver returned HTTP ${response.status}.`);
      }

      const result = await response.json();
      if (!result.success || !Array.isArray(result.webhooks)) {
        throw new Error("The receiver returned an unexpected response.");
      }

      const newestFirst = [...result.webhooks].sort(
        (first, second) =>
          new Date(second.receivedAt || second.time).getTime() -
          new Date(first.receivedAt || first.time).getTime(),
      );

      if (isMounted.current) {
        setEvents(newestFirst);
        setTotalCount(Number(result.count) || 0);
        setIsConnected(true);
        setErrorMessage("");
        setLastRefreshedAt(new Date());
      }
    } catch (error) {
      if (isMounted.current) {
        setIsConnected(false);
        setEvents([]);
        setTotalCount(0);
        setSelectedEvent(null);
        setErrorMessage(
          error instanceof Error
            ? `Could not load webhook events. ${error.message}`
            : "Could not load webhook events. Check that the Mock Receiver backend is running.",
        );
      }
    } finally {
      requestInProgress.current = false;
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  // Fetch immediately, refresh every five seconds, and clean up on unmount.
  useEffect(() => {
    isMounted.current = true;
    const initialRefreshTimer = window.setTimeout(() => {
      void refreshEvents();
    }, 0);
    const refreshTimer = window.setInterval(() => {
      void refreshEvents();
    }, 5000);

    return () => {
      isMounted.current = false;
      window.clearTimeout(initialRefreshTimer);
      window.clearInterval(refreshTimer);
    };
  }, [refreshEvents]);

  const latestEvent = events[0];

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-7 sm:py-10">
        <header className="flex flex-col justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-7">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl text-blue-700">
              <span aria-hidden="true">↗</span>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                Webhook Events Monitor
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Mock Receiver
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold ${
                isConnected
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
              role="status"
            >
              {isConnected ? <FaCircleCheck /> : <FaCircleXmark />}
              {isConnected ? "Connected" : "Disconnected"}
            </span>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
              disabled={isLoading}
              onClick={() => void refreshEvents()}
              type="button"
            >
              <FaArrowsRotate className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="mt-3 flex items-center gap-2 px-1 text-xs text-slate-500">
          <FaClock />
          <span>
            Last successful refresh:{" "}
            {lastRefreshedAt ? formatDate(lastRefreshedAt) : "Not yet"}
          </span>
        </div>

        {errorMessage && (
          <div
            className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        <section
          aria-label="Webhook summary"
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-slate-500">
              Total Received Webhooks
            </p>
            <p className="mt-3 text-4xl font-black tracking-tight text-slate-900">
              {totalCount.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Events held by this receiver
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-slate-500">
              Latest Received Event
            </p>
            {latestEvent ? (
              <>
                <p className="mt-3 text-lg font-extrabold text-slate-900">
                  {formatDate(latestEvent.receivedAt)}
                </p>
                <p className="mt-1 break-all text-xs text-slate-500">
                  {latestEvent.containerNumber} · {latestEvent.eventId}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {isConnected ? "No events received yet" : "Unavailable while disconnected"}
              </p>
            )}
          </article>
        </section>

        <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-lg font-extrabold">Received Webhooks</h2>
              <p className="mt-1 text-xs text-slate-500">
                Newest events appear first. The list refreshes every five
                seconds.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {totalCount.toLocaleString()}{" "}
              {totalCount === 1 ? "event" : "events"}
            </span>
          </div>

          {isLoading && events.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm font-semibold text-slate-500">
              <FaArrowsRotate className="mx-auto mb-3 animate-spin text-lg text-blue-700" />
              Loading webhook events…
            </div>
          ) : events.length === 0 && !errorMessage ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-xl text-blue-700">
                ↗
              </div>
              <h3 className="mt-4 font-extrabold">No webhooks received yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Waiting for the main application to send its first webhook.
              </p>
            </div>
          ) : events.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No events are available while the receiver is disconnected.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      "Event ID",
                      "Container Number",
                      "From Stage",
                      "To Stage",
                      "Event Time",
                      "Received At",
                      "Action",
                    ].map((column) => (
                      <th className="px-4 py-3 font-extrabold" key={column}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((event, index) => (
                    <tr
                      className="transition hover:bg-blue-50/50"
                      key={`${event.eventId}-${event.receivedAt || index}`}
                    >
                      <td className="max-w-52 break-all px-4 py-4 font-mono text-xs text-slate-600">
                        {event.eventId}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-bold text-slate-900">
                        {event.containerNumber}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-600">
                        {displayStage(event.fromStage)}
                      </td>
                      <td className="px-4 py-4 text-xs font-bold text-slate-800">
                        {event.toStage}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {formatDate(event.time)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {formatDate(event.receivedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
                          onClick={() => setSelectedEvent(event)}
                          type="button"
                        >
                          <FaEye /> View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-xs text-slate-400">
          Monitoring events received by the local Mock Receiver · GET requests
          only retrieve events.
        </p>
      </div>

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </main>
  );
}

export default App;
