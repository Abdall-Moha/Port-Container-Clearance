import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaKey,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaUserCheck,
  FaUsers,
  FaUserSlash,
  FaXmark,
} from "react-icons/fa6";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

const createRoles = ["IMPORTER", "CLEARING_AGENT", "CUSTOMS_OFFICER"];
const editableRoles = ["ADMIN", ...createRoles];
const roleLabels = {
  ADMIN: "Admin",
  IMPORTER: "Importer",
  CLEARING_AGENT: "Clearing Agent",
  CUSTOMS_OFFICER: "Customs Officer",
};

const emptyForm = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  role: "IMPORTER",
};

// Retrieve the full user array from the Admin-only endpoint.
async function fetchUsersFromApi() {
  const response = await api.get("/users");
  return Array.isArray(response.data?.users) ? response.data.users : [];
}

// Format a date supplied by the user-list API.
function formatCreatedDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

// Show the Admin user list and integrate its supported management actions.
function UsersManagementPage() {
  const { t } = useLanguage();
  const { user: signedInUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modalMode, setModalMode] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");

  // Load the complete user list returned by the Admin-only endpoint.
  const loadUsers = useCallback(async () => {
    try {
      const loadedUsers = await fetchUsersFromApi();
      setPageError("");
      setUsers(loadedUsers);
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to load users. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchUsersFromApi()
      .then((loadedUsers) => {
        if (isMounted) {
          setUsers(loadedUsers);
          setPageError("");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setPageError(
            error.response?.data?.message ||
              "Unable to load users. Please try again.",
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

  const visibleUsers = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return users.filter((item) => {
      const matchesSearch =
        !searchText ||
        item.fullName?.toLowerCase().includes(searchText) ||
        item.email?.toLowerCase().includes(searchText);
      const matchesRole = roleFilter === "ALL" || item.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" ? item.isActive : !item.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const activeCount = users.filter((item) => item.isActive).length;
  const inactiveCount = users.length - activeCount;

  // Open a blank form for creating a normal system user.
  function openCreateModal() {
    setSelectedUser(null);
    setForm(emptyForm);
    setFormError("");
    setModalMode("create");
  }

  // Load only backend-editable profile fields into the edit form.
  function openEditModal(targetUser) {
    setSelectedUser(targetUser);
    setForm({
      ...emptyForm,
      fullName: targetUser.fullName || "",
      email: targetUser.email || "",
      phone: targetUser.phone || "",
      role: targetUser.role || "IMPORTER",
    });
    setFormError("");
    setModalMode("edit");
  }

  // Open the Admin password-reset form without requesting the user's old password.
  function openResetModal(targetUser) {
    setSelectedUser(targetUser);
    setForm({ ...emptyForm, password: "" });
    setFormError("");
    setModalMode("reset");
  }

  // Close the user form and clear any password still in component memory.
  function closeModal() {
    if (isSaving) return;
    setModalMode("");
    setSelectedUser(null);
    setForm(emptyForm);
    setFormError("");
  }

  // Submit create, edit, or password-reset data using the matching backend route.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;

    const cleanName = form.fullName.trim();
    if (modalMode !== "reset" && !cleanName) {
      setFormError("Full name is required.");
      return;
    }

    if (modalMode === "create" && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }

    const password = form.password;
    if (
      (modalMode === "create" || modalMode === "reset") &&
      password.length < 8
    ) {
      setFormError("Password must contain at least 8 characters.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    setSuccessMessage("");

    try {
      let response;

      if (modalMode === "create") {
        response = await api.post("/users", {
          fullName: cleanName,
          email: form.email.trim().toLowerCase(),
          password,
          phone: form.phone.trim(),
          role: form.role,
        });
      } else if (modalMode === "edit") {
        response = await api.patch(
          `/users/${selectedUser._id || selectedUser.id}`,
          {
            fullName: cleanName,
            phone: form.phone.trim(),
            role: form.role,
          },
        );
      } else {
        response = await api.patch(
          `/users/${selectedUser._id || selectedUser.id}/reset-password`,
          { newPassword: password },
        );
      }

      setSuccessMessage(response.data?.message || "User updated successfully.");
      setModalMode("");
      setSelectedUser(null);
      setForm(emptyForm);
      await loadUsers();
    } catch (error) {
      setFormError(
        error.response?.data?.message ||
          "Unable to save this user. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Confirm and change account status through the existing user update route.
  async function handleStatusChange(targetUser) {
    const targetId = String(targetUser._id || targetUser.id);
    const isSelf = targetId === String(signedInUser?.id);
    const nextStatus = !targetUser.isActive;

    if (isSelf && !nextStatus) return;
    if (
      !window.confirm(
        `${nextStatus ? "Activate" : "Deactivate"} ${targetUser.fullName}?`,
      )
    )
      return;

    setBusyUserId(targetId);
    setPageError("");
    setSuccessMessage("");

    try {
      const response = await api.patch(`/users/${targetId}`, {
        isActive: nextStatus,
      });
      setSuccessMessage(
        response.data?.message ||
          `User ${nextStatus ? "activated" : "deactivated"} successfully.`,
      );
      await loadUsers();
    } catch (error) {
      setPageError(
        error.response?.data?.message ||
          "Unable to change this account status.",
      );
    } finally {
      setBusyUserId("");
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
            {t("Users Management")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage system accounts, roles, and access status.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#21377a] focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          <FaPlus /> Add User
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
        aria-label="User totals from the complete API list"
      >
        <SummaryCard
          icon={<FaUsers />}
          label="Total users"
          value={users.length}
          tone="blue"
        />
        <SummaryCard
          icon={<FaUserCheck />}
          label="Active users"
          value={activeCount}
          tone="green"
        />
        <SummaryCard
          icon={<FaUserSlash />}
          label="Inactive users"
          value={inactiveCount}
          tone="slate"
        />
      </section>
      <section
        className="flex flex-wrap items-center gap-2"
        aria-label="Users by role from the complete API list"
      >
        <span className="mr-1 text-xs font-bold text-slate-500">
          Users by role:
        </span>
        {Object.entries(roleLabels).map(([role, label]) => (
          <span
            key={role}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
          >
            {label}{" "}
            <span className="ml-1 font-extrabold text-[#172554]">
              {users.filter((item) => item.role === role).length}
            </span>
          </span>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.04]">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-extrabold text-[#172554]">System users</h2>
              <p className="mt-1 text-xs text-slate-500">
                Filters apply to the complete user list returned by the API.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="relative block">
                <span className="sr-only">Search by name or email</span>
                <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or email"
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 sm:w-52"
                />
              </label>
              <label>
                <span className="sr-only">Filter by role</span>
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
                >
                  <option value="ALL">All roles</option>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by account status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100"
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
            </div>
          </div>
        </div>

        {isLoading ? (
          <div
            className="p-12 text-center text-sm font-semibold text-slate-500"
            role="status"
          >
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            text="System users will appear here when available."
          />
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            title="No matching users"
            text="Try adjusting the search or filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">
                    <LocalizedText text={"User"} />
                  </th>
                  <th className="px-5 py-3 font-bold">
                    <LocalizedText text={"Phone"} />
                  </th>
                  <th className="px-5 py-3 font-bold">
                    <LocalizedText text={"Role"} />
                  </th>
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
                {visibleUsers.map((item) => {
                  const id = String(item._id || item.id);
                  const isSelf = id === String(signedInUser?.id);
                  return (
                    <tr
                      key={id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-[#172554]">
                          {item.fullName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.email}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {item.phone || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#2B4593]">
                          {roleLabels[item.role] || item.role}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge isActive={item.isActive} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-600">
                        {formatCreatedDate(item.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <ActionButton
                            label="Edit user"
                            onClick={() => openEditModal(item)}
                          >
                            <FaPen />
                          </ActionButton>
                          <ActionButton
                            label="Reset password"
                            onClick={() => openResetModal(item)}
                          >
                            <FaKey />
                          </ActionButton>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(item)}
                            disabled={
                              busyUserId === id || (isSelf && item.isActive)
                            }
                            title={
                              isSelf && item.isActive
                                ? "You cannot deactivate your own account."
                                : undefined
                            }
                            className={`rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${item.isActive ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                          >
                            {busyUserId === id
                              ? "Saving…"
                              : item.isActive
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
        {!isLoading && users.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {visibleUsers.length} of {users.length} users
          </p>
        )}
      </section>

      {modalMode && (
        <UserModal
          mode={modalMode}
          selectedUser={selectedUser}
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

// Display a small summary based on the full user response from the backend.
function SummaryCard({ icon, label, value, tone }) {
  const tones = {
    blue: "bg-blue-50 text-[#2B4593]",
    green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
      <span
        className={`flex size-11 items-center justify-center rounded-xl text-lg ${tones[tone]}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-black text-[#172554]">{value}</p>
      </div>
    </div>
  );
}

// Display the current account status with a readable color and label.
function StatusBadge({ isActive }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

// Keep row actions compact while giving icon-only buttons accessible labels.
function ActionButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2B4593]"
    >
      {children}
    </button>
  );
}

// Explain empty and filtered user lists without showing placeholder data.
function EmptyState({ title, text }) {
  return (
    <div className="px-5 py-14 text-center">
      <FaUsers className="mx-auto text-2xl text-slate-300" />
      <h3 className="mt-3 font-extrabold text-[#172554]">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}

// Render the add, edit, and password-reset dialogs using existing User APIs.
function UserModal({
  mode,
  selectedUser,
  form,
  setForm,
  formError,
  isSaving,
  onClose,
  onSubmit,
}) {
  const isReset = mode === "reset";
  const isEdit = mode === "edit";
  const title = isReset
    ? "Reset user password"
    : isEdit
      ? "Edit user"
      : "Add user";

  // Update one controlled user form field.
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
        aria-labelledby="user-modal-title"
        className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="user-modal-title"
              className="text-xl font-black text-[#172554]"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isReset
                ? `Set a new password for ${selectedUser.fullName}.`
                : isEdit
                  ? "Update the fields supported by the user API."
                  : "Create an Importer, Clearing Agent, or Customs Officer account."}
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
          {isReset ? (
            <FormField label="New password" htmlFor="newPassword">
              <input
                id="newPassword"
                name="password"
                type="password"
                value={form.password}
                onChange={updateField}
                minLength={8}
                autoComplete="new-password"
                required
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-slate-500">
                At least 8 characters. The old password is not required.
              </span>
            </FormField>
          ) : (
            <>
              <FormField label="Full name" htmlFor="fullName">
                <input
                  id="fullName"
                  name="fullName"
                  value={form.fullName}
                  onChange={updateField}
                  required
                  className={inputClass}
                />
              </FormField>
              {isEdit ? (
                <FormField label="Email address" htmlFor="email">
                  <input
                    id="email"
                    value={form.email}
                    disabled
                    className={`${inputClass} cursor-not-allowed bg-slate-100 text-slate-500`}
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    The backend does not support changing email addresses.
                  </span>
                </FormField>
              ) : (
                <FormField label="Email address" htmlFor="email">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={updateField}
                    autoComplete="email"
                    required
                    className={inputClass}
                  />
                </FormField>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Phone (optional)" htmlFor="phone">
                  <input
                    id="phone"
                    name="phone"
                    value={form.phone}
                    onChange={updateField}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Role" htmlFor="role">
                  <select
                    id="role"
                    name="role"
                    value={form.role}
                    onChange={updateField}
                    className={inputClass}
                  >
                    {(isEdit ? editableRoles : createRoles).map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              {!isEdit && (
                <FormField label="Temporary password" htmlFor="password">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={updateField}
                    minLength={8}
                    autoComplete="new-password"
                    required
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    At least 8 characters. Passwords are never shown after
                    saving.
                  </span>
                </FormField>
              )}
            </>
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
                : isReset
                  ? "Reset password"
                  : isEdit
                    ? "Save changes"
                    : "Create user"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100";

// Pair a form label with its input and optional help text.
function FormField({ label, htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-bold text-slate-700">
      {label}
      <div className="mt-2 font-normal">{children}</div>
    </label>
  );
}

export default UsersManagementPage;
