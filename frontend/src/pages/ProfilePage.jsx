import LocalizedText from "../components/LocalizedText.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useEffect, useState } from "react";
import { FaLock, FaPen, FaUser } from "react-icons/fa6";
import api from "../config/api.js";
import useAuth from "../context/useAuth.js";

const roleNames = {
  ADMIN: "Administrator",
  IMPORTER: "Importer",
  CLEARING_AGENT: "Clearing Agent",
  CUSTOMS_OFFICER: "Customs Officer",
};

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#2B4593] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50";

// Display and edit the authenticated user's permitted profile details and password.
function ProfilePage() {
  const { t } = useLanguage();
  const { user: authUser, updateUserProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Retrieve the authenticated user's safe profile fields.
  useEffect(() => {
    let isMounted = true;
    api
      .get("/users/me")
      .then((response) => {
        if (!isMounted) return;
        const safeProfile = response.data?.user;
        setProfile(safeProfile);
        setForm({
          fullName: safeProfile?.fullName || "",
          phone: safeProfile?.phone || "",
        });
      })
      .catch((error) => {
        if (isMounted)
          setErrorMessage(
            error.response?.data?.message || "Unable to load your profile.",
          );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Save only the full name and phone number through the self-profile endpoint.
  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (isSavingProfile) return;
    if (!form.fullName.trim()) {
      setErrorMessage("Full name cannot be empty.");
      return;
    }

    setIsSavingProfile(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await api.patch("/users/me", {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
      });
      const updatedProfile = response.data?.user;
      setProfile(updatedProfile);
      setForm({
        fullName: updatedProfile.fullName,
        phone: updatedProfile.phone || "",
      });
      setIsEditing(false);
      setSuccessMessage(
        response.data?.message || "Profile updated successfully.",
      );
      // Refresh the shared safe user name in the top dashboard header after editing.
      updateUserProfile(updatedProfile);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message || "Unable to update your profile.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  // Validate the confirmation locally and use the existing secure password API.
  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (isChangingPassword) return;
    if (passwordForm.newPassword.length < 8) {
      setErrorMessage("New password must contain at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setErrorMessage(
        "New password must be different from the current password.",
      );
      return;
    }

    setIsChangingPassword(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await api.patch("/users/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSuccessMessage(
        response.data?.message || "Password changed successfully.",
      );
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message || "Unable to change your password.",
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  // Restore unsaved profile values when the user cancels editing.
  function handleCancelEdit() {
    setForm({ fullName: profile?.fullName || "", phone: profile?.phone || "" });
    setIsEditing(false);
    setErrorMessage("");
  }

  const displayedProfile = profile || authUser;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
          <LocalizedText text={"Account"} />
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
          {t("My Profile")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          <LocalizedText
            text={"View and update your contact details and account password."}
          />
        </p>
      </header>
      {successMessage && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
        >
          {successMessage}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
        >
          {errorMessage}
        </p>
      )}

      {isLoading ? (
        <p
          role="status"
          className="rounded-2xl bg-white p-12 text-center text-sm font-semibold text-slate-500"
        >
          Loading profile…
        </p>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-4">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-xl text-[#2B4593]">
                  <FaUser />
                </span>
                <div>
                  <h2 className="text-lg font-extrabold text-[#172554]">
                    Profile information
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Your account identity and contact details.
                  </p>
                </div>
              </div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setErrorMessage("");
                    setSuccessMessage("");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <FaPen /> Edit Profile
                </button>
              )}
            </div>
            {!isEditing ? (
              <dl className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <ProfileItem
                  label="Full name"
                  value={displayedProfile?.fullName}
                />
                <ProfileItem label="Email" value={displayedProfile?.email} />
                <ProfileItem
                  label="Phone number"
                  value={displayedProfile?.phone}
                />
                <ProfileItem
                  label="Role"
                  value={
                    roleNames[displayedProfile?.role] || displayedProfile?.role
                  }
                />
                <ProfileItem
                  label="Account status"
                  value={displayedProfile?.isActive ? "Active" : "Inactive"}
                  status={Boolean(displayedProfile?.isActive)}
                />
                <ProfileItem
                  label="Member since"
                  value={
                    displayedProfile?.createdAt
                      ? new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                        }).format(new Date(displayedProfile.createdAt))
                      : "—"
                  }
                />
              </dl>
            ) : (
              <form
                onSubmit={handleProfileSubmit}
                className="space-y-5 p-5 sm:p-6"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-slate-700">
                    Full name
                    <input
                      className={inputClass}
                      value={form.fullName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fullName: event.target.value,
                        }))
                      }
                      maxLength={120}
                      autoComplete="name"
                      required
                    />
                  </label>
                  <label className="block text-sm font-bold text-slate-700">
                    Phone number
                    <input
                      className={inputClass}
                      value={form.phone}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      maxLength={30}
                      autoComplete="tel"
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  Email, role, and account status are managed by your system
                  administrator.
                </p>
                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={isSavingProfile}
                    className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700"
                  >
                    <LocalizedText text={"Cancel"} />
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="rounded-xl bg-[#2B4593] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    {isSavingProfile ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b border-slate-100 p-5 sm:p-6">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-600">
                <FaLock />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-[#172554]">
                  Change password
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Confirm your current password to choose a new one.
                </p>
              </div>
            </div>
            <form
              onSubmit={handlePasswordSubmit}
              className="space-y-5 p-5 sm:p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-700 sm:col-span-2">
                  Current password
                  <input
                    className={inputClass}
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  New password
                  <input
                    className={inputClass}
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        newPassword: event.target.value,
                      }))
                    }
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    At least 8 characters.
                  </span>
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Confirm new password
                  <input
                    className={inputClass}
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="rounded-xl bg-[#172554] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#21377a] disabled:opacity-50"
                >
                  {isChangingPassword ? "Updating…" : "Update password"}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

// Render one account field with consistent label and value styling.
function ProfileItem({ label, value, status = null }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-700">
        {status === null ? (
          value || "—"
        ) : (
          <span
            className={`inline-flex items-center gap-2 ${status ? "text-emerald-700" : "text-rose-700"}`}
          >
            <span
              className={`size-2 rounded-full ${status ? "bg-emerald-500" : "bg-rose-500"}`}
            />
            {status ? "Active" : "Inactive"}
          </span>
        )}
      </dd>
    </div>
  );
}

export default ProfilePage;
