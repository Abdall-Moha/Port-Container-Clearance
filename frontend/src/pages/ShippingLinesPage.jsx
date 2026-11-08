import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaPowerOff,
  FaRotate,
  FaShip,
  FaXmark,
} from "react-icons/fa6";
import api from "../config/api.js";

const emptyForm = { name: "", code: "", webhookUrl: "" };

// Format a timestamp returned by the Shipping Line API.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

// Load all Shipping Lines, including inactive records, for Admin management.
async function fetchShippingLines() {
  const response = await api.get("/shipping-lines");
  return Array.isArray(response.data?.shippingLines)
    ? response.data.shippingLines
    : [];
}

// Manage Shipping Lines using the existing Admin-only API operations.
function ShippingLinesPage() {
  const { t } = useLanguage();
  const [shippingLines, setShippingLines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyLineId, setBusyLineId] = useState("");

  // Refresh the complete Shipping Line list from the authenticated API.
  const loadShippingLines = useCallback(async () => {
    try {
      setShippingLines(await fetchShippingLines());
      setPageError("");
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to load Shipping Lines. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchShippingLines()
      .then((lines) => {
        if (isMounted) {
          setShippingLines(lines);
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted)
          setPageError(
            error.response?.data?.message ||
              "Unable to load Shipping Lines. Please try again.",
          );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const visibleLines = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shippingLines.filter((line) => {
      const matchesSearch =
        !term ||
        [line.name, line.code, line.webhookUrl, line.createdBy?.fullName].some(
          (value) =>
            String(value || "")
              .toLowerCase()
              .includes(term),
        );
      return (
        matchesSearch &&
        (statusFilter === "ALL" ||
          (statusFilter === "ACTIVE") === Boolean(line.isActive))
      );
    });
  }, [shippingLines, search, statusFilter]);

  const activeCount = shippingLines.filter((line) => line.isActive).length;

  // Open a blank form for a new Shipping Line.
  function openCreateForm() {
    setSelectedLine(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  // Populate the form with the selected Shipping Line's editable fields.
  function openEditForm(line) {
    setSelectedLine(line);
    setForm({
      name: line.name || "",
      code: line.code || "",
      webhookUrl: line.webhookUrl || "",
    });
    setFormError("");
    setModalOpen(true);
  }

  // Close the form and clear values that belong to the current record.
  function closeForm() {
    if (isSaving) return;
    setModalOpen(false);
    setSelectedLine(null);
    setForm(emptyForm);
    setFormError("");
  }

  // Save supported Shipping Line fields through the existing create or update API.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;
    const values = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      webhookUrl: form.webhookUrl.trim(),
    };
    if (!values.name || !values.code) {
      setFormError("Shipping Line name and code are required.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    setPageError("");
    setSuccessMessage("");
    try {
      const response = selectedLine
        ? await api.patch(`/shipping-lines/${selectedLine._id}`, values)
        : await api.post("/shipping-lines", values);
      setSuccessMessage(
        response.data?.message ||
          (selectedLine
            ? "Shipping Line updated successfully."
            : "Shipping Line created successfully."),
      );
      setModalOpen(false);
      setSelectedLine(null);
      setForm(emptyForm);
      await loadShippingLines();
    } catch (error) {
      setFormError(
        error.response?.data?.message || "Unable to save this Shipping Line.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Activate or deactivate a Shipping Line without deleting its history.
  async function handleStatusChange(line) {
    const nextStatus = !line.isActive;
    const action = nextStatus ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${action} ${line.name}?`))
      return;
    const id = String(line._id);
    setBusyLineId(id);
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.patch(`/shipping-lines/${id}/status`, {
        isActive: nextStatus,
      });
      setSuccessMessage(
        response.data?.message ||
          `Shipping Line ${nextStatus ? "activated" : "deactivated"} successfully.`,
      );
      await loadShippingLines();
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to change this Shipping Line's status.",
      );
    } finally {
      setBusyLineId("");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            Administration
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t("Shipping Line Management")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage the shipping companies available in Bill of Lading records.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#21377a"
        >
          <FaPlus /> Add Shipping Line
        </button>
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

      <section
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Shipping Line totals"
      >
        <SummaryCard
          label="Total Shipping Lines"
          value={shippingLines.length}
        />
        <SummaryCard label="Active" value={activeCount} />
        <SummaryCard
          label="Inactive"
          value={shippingLines.length - activeCount}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.04]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="font-extrabold text-[#172554]">Shipping Lines</h2>
            <p className="mt-1 text-xs text-slate-500">
              Search by name, code, webhook URL, or creator.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <span className="sr-only">Search Shipping Lines</span>
              <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Shipping Lines"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 sm:w-56"
              />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 sm:w-36"
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">
                  <LocalizedText text={"Active"} />
                </option>
                <option value="INACTIVE">
                  <LocalizedText text={"Inactive"} />
                </option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                void loadShippingLines();
              }}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <FaRotate /> <LocalizedText text={"Refresh"} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div
            className="p-12 text-center text-sm font-semibold text-slate-500"
            role="status"
          >
            Loading Shipping Lines…
          </div>
        ) : shippingLines.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FaShip className="mx-auto text-2xl text-slate-300" />
            <h3 className="mt-3 font-extrabold text-[#172554]">
              No Shipping Lines yet
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Create a Shipping Line to make it available for Bill of Lading
              records.
            </p>
            <button
              type="button"
              onClick={openCreateForm}
              className="mt-4 rounded-xl bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white"
            >
              Add Shipping Line
            </button>
          </div>
        ) : visibleLines.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No Shipping Lines match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Shipping Line</th>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Webhook URL</th>
                  <th className="px-5 py-3">
                    <LocalizedText text={"Status"} />
                  </th>
                  <th className="px-5 py-3">Created By</th>
                  <th className="px-5 py-3">
                    <LocalizedText text={"Created"} />
                  </th>
                  <th className="px-5 py-3 text-right">
                    <LocalizedText text={"Actions"} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleLines.map((line) => {
                  const id = String(line._id);
                  return (
                    <tr
                      key={id}
                      className="transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-[#172554]">{line.name}</p>
                        <p className="mt-1 text-xs text-slate-500">ID: {id}</p>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {line.code}
                      </td>
                      <td className="max-w-xs break-all px-5 py-4 text-slate-600">
                        {line.webhookUrl || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge isActive={line.isActive} />
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {line.createdBy?.fullName || "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDate(line.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(line)}
                            aria-label={`Edit ${line.name}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2B4593]"
                          >
                            <FaPen /> <LocalizedText text={"Edit"} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(line)}
                            disabled={busyLineId === id}
                            className={`rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${line.isActive ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                          >
                            {busyLineId === id ? (
                              "Saving…"
                            ) : (
                              <>
                                <FaPowerOff className="mr-1 inline" />
                                {line.isActive ? "Deactivate" : "Activate"}
                              </>
                            )}
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
        {!isLoading && shippingLines.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {visibleLines.length} of {shippingLines.length} Shipping
            Lines. Inactive records remain available here for management.
          </p>
        )}
      </section>

      {modalOpen && (
        <ShippingLineModal
          selectedLine={selectedLine}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// Display a record total in the same summary-card style as Ports Management.
function SummaryCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#172554]">{value}</p>
    </div>
  );
}

// Show whether a Shipping Line is currently available for selection.
function StatusBadge({ isActive }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

// Render create and edit forms using fields accepted by ShippingLineRoute.
function ShippingLineModal({
  selectedLine,
  form,
  setForm,
  formError,
  isSaving,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(selectedLine);

  // Update a controlled form value without changing the other fields.
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
        aria-label="Close form"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipping-line-modal-title"
        className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="shipping-line-modal-title"
              className="text-xl font-black text-[#172554]"
            >
              {isEditing ? "Edit Shipping Line" : "Add Shipping Line"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Name and code are required. Webhook URL is optional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close form"
          >
            <FaXmark />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-slate-700">
            Shipping Line name
            <input
              name="name"
              value={form.name}
              onChange={updateField}
              required
              maxLength={120}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Code
            <input
              name="code"
              value={form.code}
              onChange={updateField}
              required
              maxLength={20}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm uppercase outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              The API stores the code in uppercase.
            </span>
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Webhook URL (optional)
            <input
              name="webhookUrl"
              type="url"
              value={form.webhookUrl}
              onChange={updateField}
              placeholder="https://example.com/webhook"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Use an HTTP or HTTPS URL. Leave blank if not configured.
            </span>
          </label>
          {formError && (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
              role="alert"
            >
              {formError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700"
            >
              <LocalizedText text={"Cancel"} />
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a] disabled:opacity-50"
            >
              {isSaving
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Create Shipping Line"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default ShippingLinesPage;
