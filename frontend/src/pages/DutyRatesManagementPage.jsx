import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCalculator,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaPowerOff,
  FaRotate,
  FaXmark,
} from "react-icons/fa6";
import api from "../config/api.js";

const emptyRateForm = {
  hsChapter: "",
  dutyPercentage: "",
  portFee20FT: "",
  portFee40FT: "",
};

// Load all duty rates using the existing authenticated endpoint.
async function fetchDutyRates() {
  const response = await api.get("/duty-rates");
  return Array.isArray(response.data?.dutyRates) ? response.data.dutyRates : [];
}

// Format the rate's monetary values in USD.
function formatUsd(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
      }).format(amount)
    : "—";
}

// Show the last rate update, falling back to its creation date.
function formatUpdatedDate(rate) {
  const value = rate.updatedAt || rate.createdAt;
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

// Manage Admin-entered duty percentages and container-size port fees.
function DutyRatesManagementPage() {
  const { t } = useLanguage();
  const [rates, setRates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState(null);
  const [form, setForm] = useState(emptyRateForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyRateId, setBusyRateId] = useState("");

  // Retrieve the latest API values for the table and clear stale page errors.
  const loadRates = useCallback(async () => {
    try {
      const loadedRates = await fetchDutyRates();
      setRates(loadedRates);
      setPageError("");
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to load duty rates. Please try again.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load duty rates when the Admin opens this page and ignore results after unmount.
  useEffect(() => {
    let isMounted = true;

    fetchDutyRates()
      .then((loadedRates) => {
        if (isMounted) {
          setRates(loadedRates);
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setPageError(
            error.response?.data?.message ||
              "Unable to load duty rates. Please try again.",
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

  const visibleRates = useMemo(() => {
    const chapter = search.trim();
    if (!chapter) return rates;
    return rates.filter((rate) =>
      String(rate.hsChapter || "").includes(chapter),
    );
  }, [rates, search]);

  const activeCount = rates.filter((rate) => rate.isActive).length;

  // Prepare a blank form for creating a new rate.
  function openCreateForm() {
    setSelectedRate(null);
    setForm(emptyRateForm);
    setFormError("");
    setModalOpen(true);
  }

  // Copy only fields supported by the DutyRate model into the edit form.
  function openEditForm(rate) {
    setSelectedRate(rate);
    setForm({
      hsChapter: String(rate.hsChapter ?? ""),
      dutyPercentage: String(rate.dutyPercentage ?? ""),
      portFee20FT: String(rate.portFee20FT ?? ""),
      portFee40FT: String(rate.portFee40FT ?? ""),
    });
    setFormError("");
    setModalOpen(true);
  }

  // Close the editor unless an API save is currently in progress.
  function closeForm() {
    if (isSaving) return;
    setModalOpen(false);
    setSelectedRate(null);
    setForm(emptyRateForm);
    setFormError("");
  }

  // Validate the form and submit the exact fields accepted by DutyRateRoute.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;

    const hsChapter = form.hsChapter.trim();
    const dutyPercentageText = form.dutyPercentage.trim();
    const portFee20FTText = form.portFee20FT.trim();
    const portFee40FTText = form.portFee40FT.trim();

    if (!/^\d{2}$/.test(hsChapter)) {
      setFormError("HS Chapter must contain exactly two digits.");
      return;
    }
    if (
      [dutyPercentageText, portFee20FTText, portFee40FTText].some(
        (value) => value === "",
      )
    ) {
      setFormError("Duty percentage and both container fees are required.");
      return;
    }

    const dutyPercentage = Number(dutyPercentageText);
    const portFee20FT = Number(portFee20FTText);
    const portFee40FT = Number(portFee40FTText);
    if (
      !Number.isFinite(dutyPercentage) ||
      dutyPercentage < 0 ||
      dutyPercentage > 100
    ) {
      setFormError("Duty percentage must be between 0 and 100.");
      return;
    }
    if (
      !Number.isFinite(portFee20FT) ||
      portFee20FT < 0 ||
      !Number.isFinite(portFee40FT) ||
      portFee40FT < 0
    ) {
      setFormError(
        "Both port fees must be valid amounts greater than or equal to zero.",
      );
      return;
    }

    const values = { hsChapter, dutyPercentage, portFee20FT, portFee40FT };
    setIsSaving(true);
    setFormError("");
    setPageError("");
    setSuccessMessage("");
    try {
      const response = selectedRate
        ? await api.patch(`/duty-rates/${selectedRate._id}`, values)
        : await api.post("/duty-rates", values);
      setSuccessMessage(
        response.data?.message ||
          (selectedRate
            ? "Duty rate updated successfully."
            : "Duty rate created successfully."),
      );
      setModalOpen(false);
      setSelectedRate(null);
      setForm(emptyRateForm);
      await loadRates();
    } catch (error) {
      setFormError(
        error.response?.data?.message ||
          "Unable to save this duty rate. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Confirm deactivation, then update status through the existing PATCH endpoint.
  async function handleStatusChange(rate) {
    const nextStatus = !rate.isActive;
    if (
      !nextStatus &&
      !window.confirm(
        `Deactivate the duty rate for HS Chapter ${rate.hsChapter}? It will no longer apply to new assessments.`,
      )
    ) {
      return;
    }

    const rateId = String(rate._id);
    setBusyRateId(rateId);
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.patch(`/duty-rates/${rateId}`, {
        isActive: nextStatus,
      });
      setSuccessMessage(
        response.data?.message ||
          `Duty rate for HS Chapter ${rate.hsChapter} ${nextStatus ? "activated" : "deactivated"}.`,
      );
      await loadRates();
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to change this duty rate's status.",
      );
    } finally {
      setBusyRateId("");
    }
  }

  // Refresh the displayed records after the Admin requests an update.
  async function handleRefresh() {
    setIsRefreshing(true);
    setPageError("");
    await loadRates();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            Administration
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t("Duty Rates")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Configure authoritative duty percentages by HS Chapter and fixed
            port fees by container size. These rates apply to new assessments
            only.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <FaRotate className={isRefreshing ? "animate-spin" : ""} />{" "}
            <LocalizedText text={"Refresh"} />
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#21377a] focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            <FaPlus /> Add Duty Rate
          </button>
        </div>
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
        aria-label="Duty rate totals"
      >
        <SummaryCard label="Configured HS Chapters" value={rates.length} />
        <SummaryCard label="Active Rates" value={activeCount} />
        <SummaryCard
          label="Inactive Rates"
          value={rates.length - activeCount}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.04]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="font-extrabold text-[#172554]">Configured rates</h2>
            <p className="mt-1 text-xs text-slate-500">
              The active rate for the first two HS Code digits is used for new
              assessments.
            </p>
          </div>
          <label className="relative block">
            <span className="sr-only">Filter by HS Chapter</span>
            <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value.replace(/\D/g, "").slice(0, 2))
              }
              inputMode="numeric"
              maxLength={2}
              placeholder="Filter HS Chapter"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 sm:w-56"
            />
          </label>
        </div>

        {isLoading ? (
          <div
            className="p-12 text-center text-sm font-semibold text-slate-500"
            role="status"
          >
            Loading duty rates…
          </div>
        ) : rates.length === 0 ? (
          <EmptyState
            title="No duty rates configured"
            text="Add the authoritative HS Chapters and port fees provided by the appropriate authority. No sample rates have been added."
          />
        ) : visibleRates.length === 0 ? (
          <EmptyState
            title="No matching HS Chapter"
            text="Try a different two-digit HS Chapter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">HS Chapter</th>
                  <th className="px-5 py-3 font-bold">Duty Percentage</th>
                  <th className="px-5 py-3 font-bold">Port Fee · 20 FT</th>
                  <th className="px-5 py-3 font-bold">Port Fee · 40 FT</th>
                  <th className="px-5 py-3 font-bold">
                    <LocalizedText text={"Status"} />
                  </th>
                  <th className="px-5 py-3 font-bold">Last Updated</th>
                  <th className="px-5 py-3 text-right font-bold">
                    <LocalizedText text={"Actions"} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRates.map((rate) => {
                  const rateId = String(rate._id);
                  return (
                    <tr
                      key={rateId}
                      className={`transition-colors hover:bg-slate-50/80 ${rate.isActive ? "" : "bg-slate-50/60"}`}
                    >
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono font-bold text-[#2B4593]">
                          {rate.hsChapter}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {Number(rate.dutyPercentage)}%
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                        {formatUsd(rate.portFee20FT)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                        {formatUsd(rate.portFee40FT)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge isActive={rate.isActive} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatUpdatedDate(rate)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(rate)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2B4593]"
                            aria-label={`Edit HS Chapter ${rate.hsChapter}`}
                          >
                            <FaPen /> <LocalizedText text={"Edit"} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(rate)}
                            disabled={busyRateId === rateId}
                            className={`inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${rate.isActive ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                          >
                            <FaPowerOff />{" "}
                            {busyRateId === rateId
                              ? "Saving…"
                              : rate.isActive
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
        {!isLoading && rates.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {visibleRates.length} of {rates.length} duty rates.
            Deactivated rates remain available here for management.
          </p>
        )}
      </section>

      {modalOpen && (
        <DutyRateModal
          selectedRate={selectedRate}
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

// Show a count based only on the duty rates returned by the API.
function SummaryCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#172554]">{value}</p>
    </div>
  );
}

// Distinguish active rates from rates unavailable to new assessments.
function StatusBadge({ isActive }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

// Explain why there are no configured rates without creating example data.
function EmptyState({ title, text }) {
  return (
    <div className="px-5 py-14 text-center">
      <FaCalculator className="mx-auto text-2xl text-slate-300" />
      <h3 className="mt-3 font-extrabold text-[#172554]">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{text}</p>
    </div>
  );
}

// Render the create and edit fields accepted by DutyRateRoute.
function DutyRateModal({
  selectedRate,
  form,
  setForm,
  formError,
  isSaving,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(selectedRate);

  // Update one controlled field while keeping the remaining values intact.
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
        aria-label="Close duty rate form"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="duty-rate-modal-title"
        className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="duty-rate-modal-title"
              className="text-xl font-black text-[#172554]"
            >
              {isEditing ? "Edit Duty Rate" : "Add Duty Rate"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter values approved for this HS Chapter. Fees are in USD.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close duty rate form"
          >
            <FaXmark />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-slate-700">
            HS Chapter
            <input
              name="hsChapter"
              value={form.hsChapter}
              onChange={updateField}
              inputMode="numeric"
              pattern="[0-9]{2}"
              maxLength={2}
              required
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 font-mono text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Use the first two digits of the applicable HS Code.
            </span>
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Duty Percentage (%)
            <input
              name="dutyPercentage"
              type="number"
              value={form.dutyPercentage}
              onChange={updateField}
              min="0"
              max="100"
              step="any"
              required
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700">
              Port Fee · 20 FT (USD)
              <input
                name="portFee20FT"
                type="number"
                value={form.portFee20FT}
                onChange={updateField}
                min="0"
                step="any"
                required
                className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Port Fee · 40 FT (USD)
              <input
                name="portFee40FT"
                type="number"
                value={form.portFee40FT}
                onChange={updateField}
                min="0"
                step="any"
                required
                className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </div>
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
              className="rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#21377a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? "Saving…"
                : isEditing
                  ? "Save Changes"
                  : "Create Duty Rate"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default DutyRatesManagementPage;
