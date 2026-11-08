import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaFileLines,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaRotate,
} from "react-icons/fa6";
import { Link } from "react-router-dom";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

const emptyForm = { blNumber: "", importerId: "", shippingLine: "", port: "" };

// Format a creation date returned by the Bill of Lading API.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

// Read an ID from a populated relationship or an unpopulated ID field.
function getRelatedId(value) {
  return value && typeof value === "object"
    ? String(value._id || "")
    : String(value || "");
}

// Retrieve the Bill of Lading list using the current user's backend permissions.
async function fetchBillOfLadingRecords() {
  const response = await api.get("/bills-of-lading");
  return Array.isArray(response.data?.billsOfLading)
    ? response.data.billsOfLading
    : [];
}

// Display and manage only the Bill of Lading actions permitted for the current role.
function BillOfLadingPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [shippingLines, setShippingLines] = useState([]);
  const [ports, setPorts] = useState([]);
  const [importers, setImporters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [createdRecordId, setCreatedRecordId] = useState("");

  const canManage = ["IMPORTER", "CLEARING_AGENT"].includes(user?.role);
  const isClearingAgent = user?.role === "CLEARING_AGENT";
  const returnToContainer = user?.role === "IMPORTER";

  // Load the records the backend permits this authenticated role to see.
  const loadRecords = useCallback(async () => {
    try {
      setRecords(await fetchBillOfLadingRecords());
      setPageError("");
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to load Bill of Lading records.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchBillOfLadingRecords()
      .then((loadedRecords) => {
        if (isMounted) {
          setRecords(loadedRecords);
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted)
          setPageError(
            error.response?.data?.message ||
              "Unable to load Bill of Lading records.",
          );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) =>
      [
        record.blNumber,
        record.importer?.fullName,
        record.shippingLine?.name,
        record.port?.name,
        record.createdBy?.fullName,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [records, search]);

  // Load active shipping lines, ports, and (for Agents) active Importers for a form.
  async function loadFormOptions() {
    const requests = [
      api.get("/shipping-lines", { params: { isActive: true } }),
      api.get("/ports", { params: { isActive: true } }),
    ];
    if (isClearingAgent) requests.push(api.get("/users/active-importers"));

    const responses = await Promise.all(requests);
    setShippingLines(
      Array.isArray(responses[0].data?.shippingLines)
        ? responses[0].data.shippingLines
        : [],
    );
    setPorts(
      Array.isArray(responses[1].data?.ports) ? responses[1].data.ports : [],
    );
    setImporters(
      isClearingAgent && Array.isArray(responses[2]?.data?.users)
        ? responses[2].data.users
        : [],
    );
  }

  // Open a new record form and load only real active selection options.
  async function openCreateForm() {
    setSelectedRecord(null);
    setForm(emptyForm);
    setFormError("");
    setSuccessMessage("");
    setModalMode("create");
    setIsFormLoading(true);
    try {
      await loadFormOptions();
    } catch (error) {
      setFormError(
        error.response?.data?.message ||
          "Unable to load active shipping lines, ports, or importers.",
      );
    } finally {
      setIsFormLoading(false);
    }
  }

  // Fetch the selected record by ID before loading its editable fields.
  async function openEditForm(listRecord) {
    setSelectedRecord(null);
    setFormError("");
    setSuccessMessage("");
    setModalMode("edit");
    setIsFormLoading(true);
    try {
      const [recordResponse] = await Promise.all([
        api.get(`/bills-of-lading/${listRecord._id}`),
        loadFormOptions(),
      ]);
      const record = recordResponse.data?.billOfLading;
      if (!record)
        throw new Error(
          "The Bill of Lading record was not returned by the server.",
        );
      setSelectedRecord(record);
      setForm({
        ...emptyForm,
        blNumber: record.blNumber || "",
        importerId: getRelatedId(record.importer),
        shippingLine: getRelatedId(record.shippingLine),
        port: getRelatedId(record.port),
      });
    } catch (error) {
      setFormError(
        error.response?.data?.message ||
          error.message ||
          "Unable to load this Bill of Lading record.",
      );
    } finally {
      setIsFormLoading(false);
    }
  }

  // Close the form and clear the selected record without retaining stale form values.
  function closeForm() {
    if (isSaving) return;
    setModalMode("");
    setSelectedRecord(null);
    setForm(emptyForm);
    setFormError("");
  }

  // Submit only fields supported by the existing create or update route.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;

    if (!form.blNumber.trim() && modalMode === "create") {
      setFormError("Bill of Lading number is required.");
      return;
    }
    const hasActiveShippingLine = shippingLines.some(
      (line) => String(line._id) === form.shippingLine,
    );
    const hasActivePort = ports.some((port) => String(port._id) === form.port);
    if (
      !hasActiveShippingLine ||
      !hasActivePort ||
      (isClearingAgent && modalMode === "create" && !form.importerId)
    ) {
      setFormError(
        "Select an active shipping line and port" +
          (isClearingAgent && modalMode === "create"
            ? ", and an active importer."
            : "."),
      );
      return;
    }

    setIsSaving(true);
    setFormError("");
    setPageError("");
    setSuccessMessage("");
    try {
      let response;
      if (modalMode === "create") {
        const body = {
          blNumber: form.blNumber.trim().toUpperCase(),
          shippingLine: form.shippingLine,
          port: form.port,
        };
        if (isClearingAgent) body.importerId = form.importerId;
        response = await api.post("/bills-of-lading", body);
        setCreatedRecordId(String(response.data?.billOfLading?._id || ""));
      } else {
        response = await api.patch(`/bills-of-lading/${selectedRecord._id}`, {
          shippingLine: form.shippingLine,
          port: form.port,
        });
        setCreatedRecordId("");
      }

      setSuccessMessage(
        response.data?.message ||
          (modalMode === "create"
            ? "Bill of Lading created."
            : "Bill of Lading updated."),
      );
      setModalMode("");
      setSelectedRecord(null);
      setForm(emptyForm);
      await loadRecords();
    } catch (error) {
      setFormError(
        error.response?.data?.message || "Unable to save this Bill of Lading.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            Clearance records
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t("Bill of Lading Management")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage Bill of Lading records used when registering containers.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#21377a]"
          >
            <FaPlus /> Create Bill of Lading
          </button>
        )}
      </header>

      {successMessage && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <span>{successMessage}</span>
          {returnToContainer && createdRecordId && (
            <Link
              to={`/dashboard/containers?register=1&billOfLading=${encodeURIComponent(createdRecordId)}`}
              className="font-extrabold text-[#2B4593] underline"
            >
              Continue to Container Registration
            </Link>
          )}
        </div>
      )}
      {pageError && (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
          role="alert"
        >
          {pageError}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.04]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="font-extrabold text-[#172554]">
              Bill of Lading records
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Showing records returned for your account by the backend.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <span className="sr-only">Search Bill of Lading records</span>
              <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search records"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 sm:w-64"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                void loadRecords();
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
            Loading Bill of Lading records…
          </div>
        ) : records.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FaFileLines className="mx-auto text-2xl text-slate-300" />
            <h3 className="mt-3 font-extrabold text-[#172554]">
              No Bill of Lading records
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {canManage
                ? "Create a Bill of Lading record before registering a container."
                : "No records are available for your account."}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={openCreateForm}
                className="mt-4 rounded-xl bg-[#2B4593] px-4 py-2.5 text-sm font-extrabold text-white"
              >
                Create Bill of Lading
              </button>
            )}
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No records match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">BL Number</th>
                  <th className="px-5 py-3">Importer</th>
                  <th className="px-5 py-3">Shipping Line</th>
                  <th className="px-5 py-3">Port</th>
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
                {visibleRecords.map((record) => (
                  <tr
                    key={record._id}
                    className="transition-colors hover:bg-slate-50/70"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-bold text-[#172554]">
                      {record.blNumber}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.importer?.fullName || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.shippingLine?.name || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.port?.name || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.createdBy?.fullName || "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {formatDate(record.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void openEditForm(record)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2B4593]"
                        >
                          <FaPen /> <LocalizedText text={"Edit"} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && records.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {visibleRecords.length} of {records.length} records. No
            pagination is applied.
          </p>
        )}
      </section>

      {modalMode && (
        <BillOfLadingModal
          mode={modalMode}
          userRole={user?.role}
          record={selectedRecord}
          form={form}
          setForm={setForm}
          shippingLines={shippingLines}
          ports={ports}
          importers={importers}
          isLoading={isFormLoading}
          isSaving={isSaving}
          error={formError}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// Render create and edit forms using only fields accepted by the backend routes.
function BillOfLadingModal({
  mode,
  userRole,
  record,
  form,
  setForm,
  shippingLines,
  ports,
  importers,
  isLoading,
  isSaving,
  error,
  onClose,
  onSubmit,
}) {
  const isEditing = mode === "edit";
  const isAgent = userRole === "CLEARING_AGENT";
  const inactiveShippingLine =
    isEditing &&
    record?.shippingLine &&
    !shippingLines.some(
      (line) => line._id === getRelatedId(record.shippingLine),
    );
  const inactivePort =
    isEditing &&
    record?.port &&
    !ports.some((port) => port._id === getRelatedId(record.port));

  // Update a form field while preserving the other selected values.
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
        aria-labelledby="bl-modal-title"
        className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="bl-modal-title"
              className="text-xl font-black text-[#172554]"
            >
              {isEditing ? "Edit Bill of Lading" : "Create Bill of Lading"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isEditing
                ? "Only the shipping line and port can be changed."
                : "Select the actual shipping line and port records."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close form"
          >
            ×
          </button>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500" role="status">
            Loading available options…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {isEditing ? (
              <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                <ReadonlyDetail label="BL Number" value={record?.blNumber} />
                <ReadonlyDetail
                  label="Importer"
                  value={record?.importer?.fullName}
                />
              </div>
            ) : (
              <label className="block text-sm font-bold text-slate-700">
                Bill of Lading Number
                <input
                  name="blNumber"
                  value={form.blNumber}
                  onChange={updateField}
                  required
                  maxLength={100}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm uppercase outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
                />
              </label>
            )}
            {!isEditing && isAgent && (
              <label className="block text-sm font-bold text-slate-700">
                Importer
                <select
                  name="importerId"
                  value={form.importerId}
                  onChange={updateField}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
                >
                  <option value="">Select an active importer</option>
                  {importers.map((importer) => (
                    <option key={importer._id} value={importer._id}>
                      {importer.fullName}
                    </option>
                  ))}
                </select>
                {importers.length === 0 && (
                  <span className="mt-1 block text-xs font-medium text-amber-800">
                    No active Importers were returned by the authorized lookup.
                  </span>
                )}
              </label>
            )}
            <label className="block text-sm font-bold text-slate-700">
              Shipping Line
              <select
                name="shippingLine"
                value={form.shippingLine}
                onChange={updateField}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
              >
                <option value="">Select an active shipping line</option>
                {inactiveShippingLine && (
                  <option value={getRelatedId(record.shippingLine)} disabled>
                    {record.shippingLine.name} (inactive)
                  </option>
                )}
                {shippingLines.map((line) => (
                  <option key={line._id} value={line._id}>
                    {line.name} ({line.code})
                  </option>
                ))}
              </select>
              {inactiveShippingLine && (
                <span className="mt-1 block text-xs text-amber-800">
                  Choose an active line to replace the inactive one.
                </span>
              )}
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Port
              <select
                name="port"
                value={form.port}
                onChange={updateField}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
              >
                <option value="">Select an active port</option>
                {inactivePort && (
                  <option value={getRelatedId(record.port)} disabled>
                    {record.port.name} (inactive)
                  </option>
                )}
                {ports.map((port) => (
                  <option key={port._id} value={port._id}>
                    {port.name} ({port.code})
                  </option>
                ))}
              </select>
              {inactivePort && (
                <span className="mt-1 block text-xs text-amber-800">
                  Choose an active port to replace the inactive one.
                </span>
              )}
            </label>
            {!isEditing &&
              (shippingLines.length === 0 ||
                ports.length === 0 ||
                (isAgent && importers.length === 0)) && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Creation requires an active shipping line, active port
                  {isAgent ? ", and active importer" : ""}.
                </p>
              )}
            {error && (
              <p
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
                role="alert"
              >
                {error}
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
                disabled={
                  isSaving ||
                  !shippingLines.some(
                    (line) => String(line._id) === form.shippingLine,
                  ) ||
                  !ports.some((port) => String(port._id) === form.port) ||
                  (!isEditing && isAgent && importers.length === 0)
                }
                className="rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving
                  ? "Saving…"
                  : isEditing
                    ? "Save changes"
                    : "Create record"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

// Display immutable Bill of Lading fields while editing.
function ReadonlyDetail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">
        {value || "—"}
      </p>
    </div>
  );
}

export default BillOfLadingPage;
