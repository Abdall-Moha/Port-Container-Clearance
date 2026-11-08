import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaLocationDot,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaPowerOff,
  FaXmark,
} from "react-icons/fa6";
import api from "../config/api.js";

const blankPort = { name: "", code: "", location: "" };

// Retrieve the complete port array from the authenticated endpoint.
async function fetchPortsFromApi() {
  const response = await api.get("/ports");
  return Array.isArray(response.data?.ports) ? response.data.ports : [];
}

// Format a date supplied by the ports API.
function formatCreatedDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

// Show ports returned by the API and provide the supported Admin operations.
function PortsManagementPage() {
  const { t } = useLanguage();
  const [ports, setPorts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPort, setSelectedPort] = useState(null);
  const [form, setForm] = useState(blankPort);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyPortId, setBusyPortId] = useState("");

  // Load the current port records from the authenticated ports endpoint.
  const loadPorts = useCallback(async () => {
    try {
      const loadedPorts = await fetchPortsFromApi();
      setPageError("");
      setPorts(loadedPorts);
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to load ports. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchPortsFromApi()
      .then((loadedPorts) => {
        if (isMounted) {
          setPorts(loadedPorts);
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setPageError(
            error.response?.data?.message ||
              "Unable to load ports. Please try again.",
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visiblePorts = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    if (!searchText) return ports;

    return ports.filter((port) =>
      [port.name, port.code, port.location].some((value) =>
        value?.toLowerCase().includes(searchText),
      ),
    );
  }, [ports, search]);

  const activeCount = ports.filter((port) => port.isActive).length;

  // Open a blank form to create a new port using the backend's required fields.
  function openCreateModal() {
    setSelectedPort(null);
    setForm(blankPort);
    setFormError("");
    setModalOpen(true);
  }

  // Load the editable port fields into the update form.
  function openEditModal(port) {
    setSelectedPort(port);
    setForm({
      name: port.name || "",
      code: port.code || "",
      location: port.location || "",
    });
    setFormError("");
    setModalOpen(true);
  }

  // Close the port form and clear its current values.
  function closeModal() {
    if (isSaving) return;
    setModalOpen(false);
    setSelectedPort(null);
    setForm(blankPort);
    setFormError("");
  }

  // Validate and save a port using the existing create or update endpoint.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;

    const values = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      location: form.location.trim(),
    };

    if (!values.name || !values.code || !values.location) {
      setFormError("Port name, code, and location are required.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    setSuccessMessage("");

    try {
      const response = selectedPort
        ? await api.patch(
            `/ports/${selectedPort._id || selectedPort.id}`,
            values,
          )
        : await api.post("/ports", values);

      setSuccessMessage(
        response.data?.message ||
          (selectedPort
            ? "Port updated successfully."
            : "Port created successfully."),
      );
      setModalOpen(false);
      setSelectedPort(null);
      setForm(blankPort);
      await loadPorts();
    } catch (error) {
      setFormError(
        error.response?.data?.message ||
          "Unable to save this port. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Confirm and update a port's active status without deleting its record.
  async function handleStatusChange(port) {
    const nextStatus = !port.isActive;
    const action = nextStatus ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${action} ${port.name}?`))
      return;

    const id = String(port._id || port.id);
    setBusyPortId(id);
    setPageError("");
    setSuccessMessage("");

    try {
      const response = await api.patch(`/ports/${id}/status`, {
        isActive: nextStatus,
      });
      setSuccessMessage(
        response.data?.message ||
          `Port ${nextStatus ? "activated" : "deactivated"} successfully.`,
      );
      await loadPorts();
    } catch (error) {
      setPageError(
        error.response?.data?.message || "Unable to change this port's status.",
      );
    } finally {
      setBusyPortId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            Administration
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t("Ports Management")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage the port locations available in the clearance system.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#21377a] focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          <FaPlus /> Add Port
        </button>
      </div>

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

      <section
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Port totals from the API"
      >
        <PortSummary label="Total ports" value={ports.length} />
        <PortSummary label="Active ports" value={activeCount} />
        <PortSummary
          label="Inactive ports"
          value={ports.length - activeCount}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.04]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="font-extrabold text-[#172554]">Available ports</h2>
            <p className="mt-1 text-xs text-slate-500">
              Search covers the name, code, and location returned by the API.
            </p>
          </div>
          <label className="relative block">
            <span className="sr-only">Search ports</span>
            <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ports"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 sm:w-64"
            />
          </label>
        </div>

        {isLoading ? (
          <div
            className="p-12 text-center text-sm font-semibold text-slate-500"
            role="status"
          >
            Loading ports…
          </div>
        ) : ports.length === 0 ? (
          <PortEmptyState
            title="No ports found"
            text="Add a port to make it available in the clearance system."
          />
        ) : visiblePorts.length === 0 ? (
          <PortEmptyState
            title="No matching ports"
            text="Try another port name, code, or location."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">Port name</th>
                  <th className="px-5 py-3 font-bold">Code</th>
                  <th className="px-5 py-3 font-bold">Location</th>
                  <th className="px-5 py-3 font-bold">
                    <LocalizedText text={"Status"} />
                  </th>
                  <th className="px-5 py-3 font-bold">
                    <LocalizedText text={"Created"} />
                  </th>
                  <th className="px-5 py-3 text-right font-bold">
                    <LocalizedText text={"Actions"} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiblePorts.map((port) => {
                  const id = String(port._id || port.id);
                  return (
                    <tr
                      key={id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="px-5 py-4 font-bold text-[#172554]">
                        {port.name}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">
                          {port.code}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {port.location}
                      </td>
                      <td className="px-5 py-4">
                        <PortStatus isActive={port.isActive} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatCreatedDate(port.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(port)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2B4593]"
                            aria-label={`Edit ${port.name}`}
                            title="Edit port"
                          >
                            <FaPen />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(port)}
                            disabled={busyPortId === id}
                            className={`inline-flex min-w-24 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${port.isActive ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                          >
                            <FaPowerOff />{" "}
                            {busyPortId === id
                              ? "Saving…"
                              : port.isActive
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && ports.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {visiblePorts.length} of {ports.length} ports
          </p>
        )}
      </section>

      {modalOpen && (
        <PortModal
          selectedPort={selectedPort}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// Display a count based on the actual port list returned by the backend.
function PortSummary({ label, value }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
      <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-lg text-[#2B4593]">
        <FaLocationDot />
      </span>
      <div>
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-black text-[#172554]">{value}</p>
      </div>
    </div>
  );
}

// Show active and inactive port states consistently.
function PortStatus({ isActive }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

// Explain an empty or filtered port list without adding fictional records.
function PortEmptyState({ title, text }) {
  return (
    <div className="px-5 py-14 text-center">
      <FaLocationDot className="mx-auto text-2xl text-slate-300" />
      <h3 className="mt-3 font-extrabold text-[#172554]">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}

// Render a create or edit dialog with only the Port model's editable fields.
function PortModal({
  selectedPort,
  form,
  setForm,
  formError,
  isSaving,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(selectedPort);

  // Update one field in the controlled port form.
  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

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
        aria-labelledby="port-modal-title"
        className="relative z-10 w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="port-modal-title"
              className="text-xl font-black text-[#172554]"
            >
              {isEditing ? "Edit port" : "Add port"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter the name, code, and location required by the ports API.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close dialog"
          >
            <FaXmark />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <PortField
            label="Port name"
            name="name"
            value={form.name}
            onChange={updateField}
            placeholder="e.g. Mogadishu"
          />
          <PortField
            label="Port code"
            name="code"
            value={form.code}
            onChange={updateField}
            placeholder="Unique code"
          />
          <PortField
            label="Location"
            name="location"
            value={form.location}
            onChange={updateField}
            placeholder="City or area"
          />
          {!isEditing && (
            <p className="rounded-xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
              Mogadishu, Berbera, Bosaso, and Kismayo are examples. Add only
              ports that are not already in the system.
            </p>
          )}
          {formError && (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
              role="alert"
            >
              {formError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <LocalizedText text={"Cancel"} />
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Create port"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Render a labeled text field used by the port create and edit forms.
function PortField({ label, name, value, onChange, placeholder }) {
  return (
    <label
      htmlFor={`port-${name}`}
      className="block text-sm font-bold text-slate-700"
    >
      {label}
      <input
        id={`port-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

export default PortsManagementPage;
