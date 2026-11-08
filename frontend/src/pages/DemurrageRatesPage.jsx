import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useState } from "react";
import {
  FaCoins,
  FaPen,
  FaPlus,
  FaPowerOff,
  FaRotate,
  FaXmark,
} from "react-icons/fa6";
import api from "../config/api.js";

const containerSizes = ["20FT", "40FT"];
const emptyForm = { size: "20FT", dailyRate: "" };

// Format a configured amount without assuming a currency not specified by the project brief.
function formatRate(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString() : "—";
}

// Let Admins configure and maintain the daily rate for each supported container size.
function DemurrageRatesPage() {
  const { t } = useLanguage();
  const [rates, setRates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyRateId, setBusyRateId] = useState("");

  // Retrieve every configured rate, including inactive rates for Admin review.
  const loadRates = useCallback(async () => {
    try {
      const response = await api.get("/demurrage-rates");
      setRates(Array.isArray(response.data?.rates) ? response.data.rates : []);
      setPageError("");
    } catch (error) {
      setPageError(
        error.response?.data?.message || "Unable to load demurrage rates.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load rates when the Admin opens the page.
  useEffect(() => {
    let isMounted = true;
    api
      .get("/demurrage-rates")
      .then((response) => {
        if (isMounted) {
          setRates(
            Array.isArray(response.data?.rates) ? response.data.rates : [],
          );
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setPageError(
            error.response?.data?.message || "Unable to load demurrage rates.",
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

  // Open an empty form for a size that has no configured rate.
  function openCreateForm(size) {
    setSelectedRate(null);
    setForm({ ...emptyForm, size });
    setFormError("");
    setFormOpen(true);
  }

  // Copy an existing rate into the edit form.
  function openEditForm(rate) {
    setSelectedRate(rate);
    setForm({ size: rate.size, dailyRate: String(rate.dailyRate) });
    setFormError("");
    setFormOpen(true);
  }

  // Validate and save a rate after the Admin confirms the change.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;

    const dailyRate = Number(form.dailyRate);
    if (
      form.dailyRate.trim() === "" ||
      !Number.isFinite(dailyRate) ||
      dailyRate < 0
    ) {
      setFormError("Enter a valid daily rate greater than or equal to zero.");
      return;
    }

    const action = selectedRate ? "update" : "create";
    if (
      !window.confirm(
        `Confirm ${action} of the ${form.size} daily demurrage rate?`,
      )
    )
      return;

    setIsSaving(true);
    setFormError("");
    setPageError("");
    setSuccessMessage("");
    try {
      const values = { size: form.size, dailyRate };
      const response = selectedRate
        ? await api.patch(`/demurrage-rates/${selectedRate._id}`, values)
        : await api.post("/demurrage-rates", values);
      setSuccessMessage(
        response.data?.message || "Demurrage rate saved successfully.",
      );
      setSelectedRate(null);
      setForm(emptyForm);
      setFormOpen(false);
      await loadRates();
    } catch (error) {
      setFormError(
        error.response?.data?.message || "Unable to save this demurrage rate.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Confirm and save an activation or deactivation through the Admin API.
  async function handleStatusChange(rate) {
    const nextStatus = !rate.isActive;
    const action = nextStatus ? "activate" : "deactivate";
    if (
      !window.confirm(`Confirm ${action} of the ${rate.size} demurrage rate?`)
    )
      return;

    setBusyRateId(String(rate._id));
    setPageError("");
    setSuccessMessage("");
    try {
      const response = await api.patch(`/demurrage-rates/${rate._id}`, {
        isActive: nextStatus,
      });
      setSuccessMessage(
        response.data?.message ||
          `The ${rate.size} rate was ${nextStatus ? "activated" : "deactivated"}.`,
      );
      await loadRates();
    } catch (error) {
      setPageError(
        error.response?.data?.message || "Unable to update this rate's status.",
      );
    } finally {
      setBusyRateId("");
    }
  }

  // Refresh the list when the Admin requests current rate data.
  async function handleRefresh() {
    setIsRefreshing(true);
    await loadRates();
  }

  const ratesBySize = new Map(rates.map((rate) => [rate.size, rate]));

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            Administration
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t("Demurrage Rates")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Configure the daily demurrage amount applied to each supported
            container size.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <FaRotate className={isRefreshing ? "animate-spin" : ""} />{" "}
          <LocalizedText text={"Refresh"} />
        </button>
      </header>

      {successMessage && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
        >
          {successMessage}
        </p>
      )}
      {pageError && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
        >
          {pageError}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.04]">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <h2 className="font-extrabold text-[#172554]">
            Rates by container size
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Only active rates are used to calculate public demurrage estimates.
          </p>
        </div>
        {isLoading ? (
          <p
            role="status"
            className="p-12 text-center text-sm font-semibold text-slate-500"
          >
            Loading demurrage rates…
          </p>
        ) : (
          rates.length === 0 && (
            <p className="px-5 py-5 text-sm text-slate-600">
              No rates are configured yet. Add the authoritative amounts when
              they are available.
            </p>
          )
        )}
        {!isLoading && (
          <div className="divide-y divide-slate-100">
            {containerSizes.map((size) => {
              const rate = ratesBySize.get(size);
              const rateId = rate ? String(rate._id) : "";
              return (
                <article
                  key={size}
                  className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#2B4593]">
                      <FaCoins />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-[#172554]">{size}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {rate
                          ? `Daily rate: ${formatRate(rate.dailyRate)}`
                          : "No rate configured"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rate && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${rate.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {rate.isActive ? "Active" : "Inactive"}
                      </span>
                    )}
                    {rate ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditForm(rate)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-[#2B4593]"
                        >
                          <FaPen /> <LocalizedText text={"Edit"} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(rate)}
                          disabled={busyRateId === rateId}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50 ${rate.isActive ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                        >
                          <FaPowerOff />
                          {rate.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openCreateForm(size)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#2B4593] px-3 py-2 text-xs font-extrabold text-white hover:bg-[#21377a]"
                      >
                        <FaPlus /> Add rate
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {formOpen && (
        <RateForm
          selectedRate={selectedRate}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onClose={() => {
            setFormOpen(false);
            setSelectedRate(null);
            setFormError("");
          }}
        />
      )}
    </div>
  );
}

// Render the create and edit form for a single container-size rate.
function RateForm({
  selectedRate,
  form,
  setForm,
  formError,
  isSaving,
  onSubmit,
  onClose,
}) {
  // Update the form field while preserving the remaining values.
  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#0b1738]/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="demurrage-form-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="demurrage-form-title"
              className="text-xl font-black text-[#172554]"
            >
              {selectedRate ? "Edit Demurrage Rate" : "Add Demurrage Rate"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter the approved daily amount for the selected container size.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close rate form"
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <FaXmark />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-slate-700">
            Container size
            <select
              name="size"
              value={form.size}
              onChange={updateField}
              disabled={Boolean(selectedRate)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
            >
              {containerSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Daily rate
            <input
              name="dailyRate"
              type="number"
              min="0"
              step="any"
              value={form.dailyRate}
              onChange={updateField}
              required
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
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
              className="rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save rate"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default DemurrageRatesPage;
