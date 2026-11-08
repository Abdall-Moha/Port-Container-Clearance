import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBoxesStacked,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaPowerOff,
  FaXmark,
} from "react-icons/fa6";
import { Link, useSearchParams } from "react-router-dom";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

const clearanceStages = [
  "ARRIVED",
  "DOCUMENTS_SUBMITTED",
  "CUSTOMS_REVIEW",
  "DUTY_ASSESSED",
  "DUTY_PAID",
  "INSPECTION",
  "RELEASED",
  "COLLECTED",
];

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

const emptyRegistration = {
  billOfLading: "",
  containerNumber: "",
  size: "20FT",
  cargoDescription: "",
  hsCode: "",
  cifValue: "",
  arrivalDate: "",
  assignedAgent: "",
};

// Format a date returned by the container APIs without inventing a timestamp.
function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        parsed,
      );
}

// Match the Container model's ISO 6346 container number check-digit validation.
function isValidContainerNumber(value) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{7}$/.test(normalized)) return false;
  const letterValues = {
    A: 10,
    B: 12,
    C: 13,
    D: 14,
    E: 15,
    F: 16,
    G: 17,
    H: 18,
    I: 19,
    J: 20,
    K: 21,
    L: 23,
    M: 24,
    N: 25,
    O: 26,
    P: 27,
    Q: 28,
    R: 29,
    S: 30,
    T: 31,
    U: 32,
    V: 34,
    W: 35,
    X: 36,
    Y: 37,
    Z: 38,
  };
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const character = normalized[index];
    const valueAtPosition = /[0-9]/.test(character)
      ? Number(character)
      : letterValues[character];
    sum += valueAtPosition * 2 ** index;
  }
  const remainder = sum % 11;
  return (remainder === 10 ? 0 : remainder) === Number(normalized[10]);
}

// Render the authorized container list and the existing registration workflow.
function ContainersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [containers, setContainers] = useState([]);
  const [ports, setPorts] = useState([]);
  const [billsOfLading, setBillsOfLading] = useState([]);
  const [clearingAgents, setClearingAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registration, setRegistration] = useState(emptyRegistration);
  const [registrationError, setRegistrationError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [editingContainer, setEditingContainer] = useState(null);
  const [busyContainerId, setBusyContainerId] = useState("");

  // Fetch only containers the authenticated backend role is allowed to see.
  const loadContainers = useCallback(
    async (stage = stageFilter) => {
      try {
        const response = await api.get("/containers", {
          params: stage ? { stage } : {},
        });
        setContainers(
          Array.isArray(response.data?.containers)
            ? response.data.containers
            : [],
        );
        setPageError("");
      } catch (error) {
        setPageError(
          error.response?.data?.message || "Unable to load containers.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [stageFilter],
  );

  // Resolve Bill of Lading port IDs to names using the authenticated ports API.
  useEffect(() => {
    let isMounted = true;
    api
      .get("/ports")
      .then((response) => {
        if (isMounted)
          setPorts(
            Array.isArray(response.data?.ports) ? response.data.ports : [],
          );
      })
      .catch(() => {
        // Container details remain usable if the optional port names are unavailable.
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const portNamesById = useMemo(
    () => new Map(ports.map((port) => [String(port._id), port.name])),
    [ports],
  );
  const getPortName = useCallback(
    (portValue) => {
      if (portValue && typeof portValue === "object") {
        return (
          portValue.name || portNamesById.get(String(portValue._id)) || "—"
        );
      }
      return portNamesById.get(String(portValue || "")) || "—";
    },
    [portNamesById],
  );

  useEffect(() => {
    let isMounted = true;
    api
      .get("/containers", { params: stageFilter ? { stage: stageFilter } : {} })
      .then((response) => {
        if (isMounted) {
          setContainers(
            Array.isArray(response.data?.containers)
              ? response.data.containers
              : [],
          );
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted)
          setPageError(
            error.response?.data?.message || "Unable to load containers.",
          );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [stageFilter]);

  // Open a container selected from a dashboard link after the authorized list loads.
  useEffect(() => {
    const requestedContainerId = searchParams.get("container");
    if (!requestedContainerId || isLoading) return;

    const container = containers.find(
      (item) => String(item._id) === requestedContainerId,
    );
    if (container) setSelectedContainer(container);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("container");
    setSearchParams(nextParams, { replace: true });
  }, [containers, isLoading, searchParams, setSearchParams]);

  // Load Bills of Lading visible to the current role before container registration.
  const openRegistration = useCallback(
    async (preferredBillOfLadingId = "") => {
      setRegistrationError("");
      setSuccessMessage("");
      try {
        const requests = [api.get("/bills-of-lading")];
        if (user?.role === "IMPORTER")
          requests.push(api.get("/users/active-clearing-agents"));
        const [response, agentsResponse] = await Promise.all(requests);
        const records = Array.isArray(response.data?.billsOfLading)
          ? response.data.billsOfLading
          : [];
        setBillsOfLading(records);
        setClearingAgents(
          Array.isArray(agentsResponse?.data?.users)
            ? agentsResponse.data.users
            : [],
        );
        const preferredRecord = records.find(
          (record) => String(record._id) === preferredBillOfLadingId,
        );
        setRegistration({
          ...emptyRegistration,
          billOfLading: preferredRecord?._id || records[0]?._id || "",
        });
        setRegistrationOpen(true);
      } catch (error) {
        const message =
          error.response?.data?.message ||
          "Unable to load your Bills of Lading.";
        setRegistrationError(message);
        setPageError(message);
      }
    },
    [user],
  );

  // Reopen registration with the newly created Bill of Lading selected.
  useEffect(() => {
    if (user?.role !== "IMPORTER" || searchParams.get("register") !== "1")
      return;
    let isMounted = true;
    const preferredBillOfLadingId = searchParams.get("billOfLading") || "";
    Promise.all([
      api.get("/bills-of-lading"),
      api.get("/users/active-clearing-agents"),
    ])
      .then(([response, agentsResponse]) => {
        if (!isMounted) return;
        const records = Array.isArray(response.data?.billsOfLading)
          ? response.data.billsOfLading
          : [];
        const preferredRecord = records.find(
          (record) => String(record._id) === preferredBillOfLadingId,
        );
        setBillsOfLading(records);
        setClearingAgents(
          Array.isArray(agentsResponse.data?.users)
            ? agentsResponse.data.users
            : [],
        );
        setRegistration({
          ...emptyRegistration,
          billOfLading: preferredRecord?._id || records[0]?._id || "",
        });
        setRegistrationOpen(true);
        setPageError("");
      })
      .catch((error) => {
        if (isMounted) {
          const message =
            error.response?.data?.message ||
            "Unable to load your Bills of Lading.";
          setRegistrationError(message);
          setPageError(message);
        }
      })
      .finally(() => {
        if (isMounted) setSearchParams({}, { replace: true });
      });
    return () => {
      isMounted = false;
    };
  }, [searchParams, setSearchParams, user?.role]);

  // Register using only the fields required by POST /api/containers.
  async function handleRegister(event) {
    event.preventDefault();
    if (isSaving) return;
    if (!isValidContainerNumber(registration.containerNumber)) {
      setRegistrationError(
        "Enter a valid ISO 6346 container number, including its check digit.",
      );
      return;
    }
    setIsSaving(true);
    setRegistrationError("");
    setSuccessMessage("");

    try {
      const requestBody = {
        ...registration,
        containerNumber: registration.containerNumber.trim().toUpperCase(),
        cargoDescription: registration.cargoDescription.trim(),
        hsCode: registration.hsCode.trim(),
        cifValue: Number(registration.cifValue),
        arrivalDate: new Date(
          `${registration.arrivalDate}T00:00:00`,
        ).toISOString(),
      };
      if (user?.role === "IMPORTER")
        requestBody.assignedAgent = registration.assignedAgent || null;
      await api.post("/containers", requestBody);
      setSearch("");
      setDateFilter("");
      setStageFilter("");
      setIsLoading(true);
      setRegistrationOpen(false);
      setRegistration(emptyRegistration);
      setSuccessMessage("Container registered. It is now at ARRIVED.");
      await loadContainers("");
    } catch (error) {
      setRegistrationError(
        error.response?.data?.message || "Unable to register this container.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Open the edit form only for records the current role is allowed to edit.
  async function openEditContainer(container) {
    setRegistrationError("");
    try {
      const requests = [api.get("/bills-of-lading")];
      if (user?.role === "IMPORTER")
        requests.push(api.get("/users/active-clearing-agents"));
      else if (user?.role === "ADMIN")
        requests.push(
          api.get("/users", { params: { role: "CLEARING_AGENT" } }),
        );
      const [billsResponse, agentsResponse] = await Promise.all(requests);
      const importerId = String(
        container.importer?._id || container.importer || "",
      );
      setBillsOfLading(
        (Array.isArray(billsResponse.data?.billsOfLading)
          ? billsResponse.data.billsOfLading
          : []
        ).filter(
          (bill) =>
            String(bill.importer?._id || bill.importer || "") === importerId,
        ),
      );
      const agents = Array.isArray(agentsResponse?.data?.users)
        ? agentsResponse.data.users
        : [];
      setClearingAgents(agents.filter((agent) => agent.isActive !== false));
    } catch (error) {
      setRegistrationError(
        error.response?.data?.message ||
          "Unable to load container editing options.",
      );
      return;
    }
    setEditingContainer(container);
    setRegistration({
      billOfLading: String(
        container.billOfLading?._id || container.billOfLading || "",
      ),
      containerNumber: container.containerNumber || "",
      size: container.size || "20FT",
      cargoDescription: container.cargoDescription || "",
      hsCode: container.hsCode || "",
      cifValue: String(container.cifValue ?? ""),
      arrivalDate: container.arrivalDate
        ? new Date(container.arrivalDate).toISOString().slice(0, 10)
        : "",
      assignedAgent: String(
        container.assignedAgent?._id || container.assignedAgent || "",
      ),
    });
    setRegistrationError("");
    setRegistrationOpen(true);
  }

  // Save the allowed editable fields without changing workflow or ownership fields.
  async function handleEdit(event) {
    event.preventDefault();
    if (!editingContainer || isSaving) return;
    if (!isValidContainerNumber(registration.containerNumber)) {
      setRegistrationError(
        "Enter a valid ISO 6346 container number, including its check digit.",
      );
      return;
    }
    setIsSaving(true);
    setRegistrationError("");
    try {
      const updates = {
        containerNumber: registration.containerNumber.trim().toUpperCase(),
        billOfLading: registration.billOfLading,
        size: registration.size,
        cargoDescription: registration.cargoDescription.trim(),
        arrivalDate: new Date(
          `${registration.arrivalDate}T00:00:00`,
        ).toISOString(),
        assignedAgent: registration.assignedAgent || null,
      };
      if (
        !editingContainer.dutyAssessment ||
        registration.hsCode.trim() !== editingContainer.hsCode
      ) {
        updates.hsCode = registration.hsCode.trim();
      }
      if (
        !editingContainer.dutyAssessment ||
        Number(registration.cifValue) !== Number(editingContainer.cifValue)
      ) {
        updates.cifValue = Number(registration.cifValue);
      }
      await api.patch(`/containers/${editingContainer._id}`, updates);
      setRegistrationOpen(false);
      setEditingContainer(null);
      setSuccessMessage("Container details updated successfully.");
      await loadContainers();
    } catch (error) {
      setRegistrationError(
        error.response?.data?.message || "Unable to update this container.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Confirm before asking the Admin-only endpoint to deactivate a container.
  async function handleDeactivate(container) {
    if (
      !window.confirm(
        `Deactivate container ${container.containerNumber}? It will remain available as historical information.`,
      )
    )
      return;
    setBusyContainerId(String(container._id));
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.patch(
        `/containers/${container._id}/deactivate`,
      );
      setSuccessMessage(
        response.data?.message || "Container deactivated successfully.",
      );
      await loadContainers();
    } catch (error) {
      setPageError(
        error.response?.data?.message || "Unable to deactivate this container.",
      );
    } finally {
      setBusyContainerId("");
    }
  }

  const visibleContainers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return containers.filter((container) => {
      const matchesSearch =
        !term ||
        [
          container.containerNumber,
          container.importer?.fullName,
          container.assignedAgent?.fullName,
          getPortName(container.billOfLading?.port),
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(term),
        );
      const date = container.createdAt
        ? new Date(container.createdAt).toISOString().slice(0, 10)
        : "";
      return matchesSearch && (!dateFilter || date === dateFilter);
    });
  }, [containers, search, dateFilter, getPortName]);

  const isImporter = user?.role === "IMPORTER";
  const title =
    user?.role === "CLEARING_AGENT" ? "Assigned Containers" : "Containers";

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            <LocalizedText text={"Clearance workspace"} />
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t(title)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            View containers returned by the backend for your role and follow
            their recorded clearance progress.
          </p>
        </div>
        {isImporter && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/dashboard/bills-of-lading"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-[#2B4593] transition hover:bg-blue-50"
            >
              Manage Bill of Lading
            </Link>
            <button
              type="button"
              onClick={() => void openRegistration()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a]"
            >
              <FaPlus /> Register Container
            </button>
          </div>
        )}
      </header>

      {successMessage && (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {successMessage}
        </p>
      )}
      {pageError && (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
          role="alert"
        >
          {pageError}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3 sm:p-5">
          <div className="relative sm:col-span-1">
            <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
            <input
              aria-label="Search loaded containers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search loaded results"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <label className="text-xs font-semibold text-slate-500">
            Filter by stage (server-side)
            <select
              value={stageFilter}
              onChange={(event) => {
                setIsLoading(true);
                setStageFilter(event.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2B4593]"
            >
              <option value="">All stages</option>
              {clearanceStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels[stage]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Registration date (loaded results)
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2B4593]"
            />
          </label>
          <p className="text-xs leading-5 text-slate-500 sm:col-span-3">
            The backend has no search, port/date filter, or pagination
            parameters. Search and date filtering apply only to this role-scoped
            API response.
          </p>
        </div>

        {isLoading ? (
          <div
            className="p-12 text-center text-sm font-semibold text-slate-500"
            role="status"
          >
            Loading containers…
          </div>
        ) : visibleContainers.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FaBoxesStacked className="mx-auto text-2xl text-slate-300" />
            <h2 className="mt-3 font-extrabold text-[#172554]">
              No containers found
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              There are no matching containers in the records you are authorized
              to view.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">
                    <LocalizedText text={"Container"} />
                  </th>
                  <th className="px-5 py-3">Port</th>
                  <th className="px-5 py-3">Importer</th>
                  <th className="px-5 py-3">
                    <LocalizedText text={"Clearing Agent"} />
                  </th>
                  <th className="px-5 py-3">Current Stage</th>
                  <th className="px-5 py-3">
                    <LocalizedText text={"Status"} />
                  </th>
                  <th className="px-5 py-3">Registered</th>
                  <th className="px-5 py-3 text-right">
                    <LocalizedText text={"Actions"} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleContainers.map((container) => (
                  <tr key={container._id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-bold text-[#172554]">
                      {container.containerNumber}
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        {container.billOfLading?.blNumber || "No BL number"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {getPortName(container.billOfLading?.port)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {container.importer?.fullName || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {container.assignedAgent?.fullName || "Unassigned"}
                    </td>
                    <td className="px-5 py-4">
                      <StageBadge stage={container.currentStage} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={container.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {formatDate(container.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedContainer(container)}
                          className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-[#2B4593] hover:bg-blue-50"
                        >
                          <LocalizedText text={"View"} />
                        </button>
                        {((isImporter &&
                          String(
                            container.createdBy?._id || container.createdBy,
                          ) === String(user?.id || user?._id) &&
                          container.status !== "INACTIVE" &&
                          container.status !== "COMPLETED" &&
                          container.currentStage !== "COLLECTED") ||
                          (user?.role === "ADMIN" &&
                            container.status !== "INACTIVE" &&
                            container.status !== "COMPLETED" &&
                            container.currentStage !== "COLLECTED")) && (
                          <button
                            type="button"
                            onClick={() => openEditContainer(container)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <FaPen /> <LocalizedText text={"Edit"} />
                          </button>
                        )}
                        {user?.role === "ADMIN" &&
                          container.status !== "INACTIVE" && (
                            <button
                              type="button"
                              disabled={
                                busyContainerId === String(container._id)
                              }
                              onClick={() => void handleDeactivate(container)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <FaPowerOff />
                              {busyContainerId === String(container._id)
                                ? "Saving…"
                                : "Deactivate"}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && containers.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {visibleContainers.length} of {containers.length} containers
            returned by the API.
          </p>
        )}
      </section>

      {selectedContainer && (
        <ContainerDetails
          containerId={selectedContainer._id}
          portName={getPortName(selectedContainer.billOfLading?.port)}
          onClose={() => setSelectedContainer(null)}
        />
      )}
      {registrationOpen && (
        <RegistrationModal
          userRole={user?.role}
          isEditing={Boolean(editingContainer)}
          isDutyAssessed={Boolean(editingContainer?.dutyAssessment)}
          billsOfLading={billsOfLading}
          clearingAgents={clearingAgents}
          values={registration}
          setValues={setRegistration}
          error={registrationError}
          isSaving={isSaving}
          onClose={() => {
            if (!isSaving) {
              setRegistrationOpen(false);
              setEditingContainer(null);
            }
          }}
          onSubmit={editingContainer ? handleEdit : handleRegister}
        />
      )}
    </div>
  );
}

// Display a role-authorized container detail and its actual clearance events.
function ContainerDetails({ containerId, portName, onClose }) {
  const [container, setContainer] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      api.get(`/containers/${containerId}`),
      api.get(`/clearance-events/container/${containerId}`),
    ])
      .then(([containerResponse, eventsResponse]) => {
        if (isMounted) {
          setContainer(containerResponse.data?.container);
          setEvents(
            Array.isArray(eventsResponse.data?.events)
              ? eventsResponse.data.events
              : [],
          );
        }
      })
      .catch((requestError) => {
        if (isMounted)
          setError(
            requestError.response?.data?.message ||
              "Unable to load container details.",
          );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [containerId]);

  const completed = new Map(events.map((event) => [event.toStage, event]));
  const activeStageIndex = clearanceStages.indexOf(container?.currentStage);

  return (
    <ModalShell title="Container details" onClose={onClose}>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500" role="status">
          Loading container history…
        </p>
      ) : error ? (
        <p
          className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      ) : (
        container && (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <Detail
                label="Container number"
                value={container.containerNumber}
              />
              <Detail
                label="Bill of Lading"
                value={container.billOfLading?.blNumber}
              />
              <Detail label="Port" value={portName} />
              <Detail label="Importer" value={container.importer?.fullName} />
              <Detail
                label="Clearing Agent"
                value={container.assignedAgent?.fullName || "Unassigned"}
              />
              <Detail
                label="Arrival date"
                value={formatDate(container.arrivalDate)}
              />
              <Detail
                label="Registered"
                value={formatDate(container.createdAt)}
              />
              <div>
                <p className="text-xs font-bold text-slate-500">
                  <LocalizedText text={"Current stage"} />
                </p>
                <div className="mt-1">
                  <StageBadge stage={container.currentStage} />
                </div>
              </div>
            </div>
            <section>
              <h3 className="font-extrabold text-[#172554]">
                <LocalizedText text={"Clearance progress"} />
              </h3>
              <ol className="mt-3 space-y-2">
                {clearanceStages.map((stage, index) => {
                  const event = completed.get(stage);
                  const isDone = Boolean(event);
                  const isCurrent = index === activeStageIndex;
                  return (
                    <li
                      key={stage}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${isCurrent ? "border-blue-200 bg-blue-50" : isDone ? "border-emerald-100 bg-emerald-50/60" : "border-slate-100 bg-white"}`}
                    >
                      <span
                        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${isDone ? "bg-emerald-600 text-white" : isCurrent ? "bg-[#2B4593] text-white" : "bg-slate-100 text-slate-400"}`}
                      >
                        {isDone ? "✓" : index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800">
                          {stageLabels[stage]}
                          {isCurrent && (
                            <span className="ml-2 text-xs font-semibold text-[#2B4593]">
                              <LocalizedText text={"Current"} />
                            </span>
                          )}
                        </p>
                        {event && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDate(event.createdAt)}
                            {event.performedBy?.fullName
                              ? ` · ${event.performedBy.fullName}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-xs text-slate-500">
                A stage is marked completed only when its clearance event is
                present.
              </p>
            </section>
            <Link
              to={`/dashboard/documents?container=${containerId}`}
              onClick={onClose}
              className="inline-flex rounded-xl bg-[#2B4593] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#21377a]"
            >
              View related documents
            </Link>
          </div>
        )
      )}
    </ModalShell>
  );
}

// Render a compact stage label using the stage value returned by the backend.
function StageBadge({ stage }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#2B4593]">
      <LocalizedText text={stageLabels[stage] || stage || "Unknown"} />
    </span>
  );
}

// Make administrative and workflow container statuses visible in the list.
function StatusBadge({ status }) {
  const style =
    status === "INACTIVE"
      ? "bg-rose-50 text-rose-700"
      : status === "HELD"
        ? "bg-amber-50 text-amber-800"
        : status === "COMPLETED"
          ? "bg-slate-100 text-slate-600"
          : "bg-emerald-50 text-emerald-700";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style}`}
    >
      <LocalizedText text={status || "ACTIVE"} />
    </span>
  );
}

// Present one container detail without assuming missing relationship values.
function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value || "—"}
      </p>
    </div>
  );
}

// Render the shared modal frame used by the container dialogs.
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#0b1738]/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="container-modal-title"
        className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id="container-modal-title"
            className="text-xl font-black text-[#172554]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close details"
          >
            <FaXmark />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

// Render the registration and edit forms with fields accepted by ContainerRoute.
function RegistrationModal({
  userRole,
  isEditing,
  isDutyAssessed,
  billsOfLading,
  clearingAgents,
  values,
  setValues,
  error,
  isSaving,
  onClose,
  onSubmit,
}) {
  function update(event) {
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }
  const canChooseAgent =
    userRole === "IMPORTER" || (isEditing && userRole === "ADMIN");
  return (
    <ModalShell
      title={isEditing ? "Edit container" : "Register container"}
      onClose={onClose}
    >
      {billsOfLading.length === 0 ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Create a Bill of Lading record before registering a container. You
            can return here after creating one.
          </p>
          {error && (
            <p className="text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}
          <Link
            to="/dashboard/bills-of-lading?returnTo=container"
            onClick={onClose}
            className="inline-flex rounded-xl bg-[#2B4593] px-4 py-3 text-sm font-extrabold text-white"
          >
            Create Bill of Lading
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-xl border px-4 py-3 text-sm font-bold"
          >
            <LocalizedText text={"Close"} />
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700 sm:col-span-2">
              Bill of Lading
              <select
                name="billOfLading"
                value={values.billOfLading}
                onChange={update}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                {billsOfLading.map((bill) => (
                  <option key={bill._id} value={bill._id}>
                    {bill.blNumber} · {bill.port?.name || "Port unavailable"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700 sm:col-span-2">
              Container Number
              <input
                name="containerNumber"
                value={values.containerNumber}
                onChange={update}
                required
                pattern="[A-Za-z]{4}[0-9]{7}"
                title="Four letters followed by seven digits, with a valid ISO 6346 check digit."
                placeholder="MSKU1234566"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm uppercase"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              <LocalizedText text={"Container Size"} />
              <select
                name="size"
                value={values.size}
                onChange={update}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                <option>20FT</option>
                <option>40FT</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              <LocalizedText text={"Arrival Date"} />
              <input
                type="date"
                name="arrivalDate"
                value={values.arrivalDate}
                onChange={update}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700 sm:col-span-2">
              <LocalizedText text={"Cargo Description"} />
              <input
                name="cargoDescription"
                value={values.cargoDescription}
                onChange={update}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              <LocalizedText text={"HS Code"} />
              <input
                name="hsCode"
                value={values.hsCode}
                onChange={update}
                required
                disabled={isDutyAssessed}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm disabled:bg-slate-100"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              <LocalizedText text={"CIF Value"} />
              <input
                type="number"
                name="cifValue"
                value={values.cifValue}
                onChange={update}
                min="0.01"
                step="0.01"
                required
                disabled={isDutyAssessed}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm disabled:bg-slate-100"
              />
            </label>
            {canChooseAgent && (
              <label className="block text-sm font-bold text-slate-700 sm:col-span-2">
                <LocalizedText text={"Assign Clearing Agent (Optional)"} />
                <select
                  name="assignedAgent"
                  value={values.assignedAgent || ""}
                  onChange={update}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
                >
                  <option value="">
                    <LocalizedText text={"No agent assigned"} />
                  </option>
                  {clearingAgents.map((agent) => (
                    <option key={agent._id} value={agent._id}>
                      {agent.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {error && (
            <p
              className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
              role="alert"
            >
              {error}
            </p>
          )}
          <p className="text-xs leading-5 text-slate-500">
            Enter a valid container number following the ISO 6346 international
            standard. Your container will begin the clearance process after
            registration.
          </p>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold"
            >
              <LocalizedText text={"Cancel"} />
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {isSaving
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Register container"}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

export default ContainersPage;
