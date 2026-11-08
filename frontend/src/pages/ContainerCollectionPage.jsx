import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaBox, FaRotate, FaTruck, FaUnlock } from "react-icons/fa6";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

// Load the signed-in agent's released containers and their Release Orders.
async function loadCollectionRecords() {
  const [containersResponse, ordersResponse] = await Promise.all([
    api.get("/containers", { params: { stage: "RELEASED" } }),
    api.get("/release-orders"),
  ]);

  return {
    containers: containersResponse.data?.containers || [],
    releaseOrders: ordersResponse.data?.releaseOrders || [],
  };
}

// Display assigned containers and securely submit their Gate Codes for collection.
function ContainerCollectionPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [containers, setContainers] = useState([]);
  const [releaseOrders, setReleaseOrders] = useState([]);
  const [gateCodes, setGateCodes] = useState({});
  const [collectionErrors, setCollectionErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collectingId, setCollectingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Refresh the role-scoped lists after collection or a manual refresh.
  const refresh = useCallback(async () => {
    setErrorMessage("");
    try {
      const data = await loadCollectionRecords();
      setContainers(data.containers);
      setReleaseOrders(data.releaseOrders);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ||
          "Unable to load your pending collections.",
      );
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const requestId = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(requestId);
  }, [refresh]);

  const pendingCollections = useMemo(() => {
    const ordersByContainerId = new Map();
    const newestFirst = [...releaseOrders].sort(
      (left, right) =>
        new Date(right.createdAt || right.issuedAt || 0).getTime() -
          new Date(left.createdAt || left.issuedAt || 0).getTime() ||
        String(right._id).localeCompare(String(left._id)),
    );

    // Keep only the latest order so a revoked history entry cannot hide its replacement.
    for (const order of newestFirst) {
      const containerId = String(order.container?._id || order.container);
      if (!ordersByContainerId.has(containerId))
        ordersByContainerId.set(containerId, order);
    }

    return containers
      .filter(
        (container) =>
          container.currentStage === "RELEASED" &&
          container.status === "ACTIVE" &&
          String(container.assignedAgent?._id || container.assignedAgent) ===
            String(user?.id),
      )
      .map((container) => ({
        container,
        order: ordersByContainerId.get(String(container._id)),
      }))
      .filter(
        ({ order }) =>
          order?.status === "ISSUED" && !order.isRevoked && !order.gateCodeUsed,
      );
  }, [containers, releaseOrders, user?.id]);

  // Submit the entered Gate Code to the existing authenticated collection endpoint.
  async function collectContainer(event, order) {
    event.preventDefault();
    const gateCode = gateCodes[order._id] || "";
    if (!/^\d{6}$/.test(gateCode) || collectingId) return;

    setCollectionErrors((current) => ({ ...current, [order._id]: "" }));
    setSuccessMessage("");
    setCollectingId(order._id);

    try {
      await api.patch(`/release-orders/${order._id}/collect`, { gateCode });
      setSuccessMessage("Correct Code. Container collected successfully.");
      setGateCodes((current) => ({ ...current, [order._id]: "" }));
      await refresh();
    } catch (error) {
      const responseMessage =
        error.response?.data?.message ||
        "Unable to collect this container. Please try again.";
      const fieldMessage = /incorrect gate code/i.test(responseMessage)
        ? "Incorrect Code"
        : responseMessage;
      setCollectionErrors((current) => ({
        ...current,
        [order._id]: fieldMessage,
      }));
    } finally {
      setCollectingId("");
    }
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            Port operations
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t("Container Collection")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Enter the six-digit Gate Code from the Release Order PDF to record a
            container collection.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            void refresh();
          }}
          disabled={refreshing || isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <FaRotate className={refreshing ? "animate-spin" : ""} />{" "}
          <LocalizedText text={"Refresh"} />
        </button>
      </header>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
        >
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {successMessage}
        </p>
      )}

      {isLoading ? (
        <p
          role="status"
          className="rounded-2xl bg-white p-12 text-center text-sm font-semibold text-slate-500"
        >
          Loading assigned containers…
        </p>
      ) : errorMessage ? null : pendingCollections.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-14 text-center shadow-sm">
          <FaBox className="mx-auto text-3xl text-slate-300" />
          <h2 className="mt-3 font-extrabold text-[#172554]">
            <LocalizedText text={"No containers awaiting collection"} />
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            Assigned containers will appear here after Customs issues a valid
            Release Order.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 p-4 sm:p-5">
            <h2 className="font-extrabold text-[#172554]">
              <LocalizedText text={"Ready for collection"} />
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              <LocalizedText
                text={
                  "Only containers assigned to your account and currently released are listed."
                }
              />
            </p>
          </header>
          <div className="divide-y divide-slate-100">
            {pendingCollections.map(({ container, order }) => (
              <article
                key={container._id}
                className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center"
              >
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Info
                    label="Container number"
                    value={container.containerNumber}
                    emphasis
                  />
                  <Info
                    label="Bill of Lading"
                    value={container.billOfLading?.blNumber}
                  />
                  <Info label="Importer" value={container.importer?.fullName} />
                  <Info label="Container size" value={container.size} />
                  <Info
                    label="Release Order"
                    value="Active · Ready for collection"
                  />
                </div>
                <form
                  onSubmit={(event) => void collectContainer(event, order)}
                  className="flex flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <label className="block min-w-0 flex-1 sm:min-w-48">
                    <span className="mb-1 block text-xs font-extrabold text-slate-600">
                      Six-digit Gate Code
                    </span>
                    <input
                      type="text"
                      name="gateCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={gateCodes[order._id] || ""}
                      onChange={(event) => {
                        setGateCodes((current) => ({
                          ...current,
                          [order._id]: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 6),
                        }));
                        setCollectionErrors((current) => ({
                          ...current,
                          [order._id]: "",
                        }));
                        setSuccessMessage("");
                      }}
                      placeholder="000000"
                      required
                      aria-label={`Gate Code for ${container.containerNumber}`}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono tracking-[0.2em] outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
                    />
                    {collectionErrors[order._id] && (
                      <span
                        role="alert"
                        className="mt-1 block text-xs font-semibold text-rose-600"
                      >
                        {collectionErrors[order._id]}
                      </span>
                    )}
                  </label>
                  <button
                    type="submit"
                    disabled={
                      collectingId === order._id ||
                      (gateCodes[order._id] || "").length !== 6
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#21377a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {collectingId === order._id ? (
                      <>
                        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />{" "}
                        Collecting…
                      </>
                    ) : (
                      <>
                        <FaTruck /> Record Collection
                      </>
                    )}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <FaUnlock className="mt-0.5 shrink-0 text-[#2B4593]" />
        The Gate Code is sent securely for verification and is never added to
        the page URL.
      </p>
    </main>
  );
}

// Show a container detail with a consistent label and value style.
function Info({ label, value, emphasis = false }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm ${emphasis ? "font-extrabold text-[#172554]" : "font-semibold text-slate-700"}`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

export default ContainerCollectionPage;
