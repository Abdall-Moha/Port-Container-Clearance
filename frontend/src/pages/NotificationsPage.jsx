import LocalizedText from "../components/LocalizedText.jsx";
import { useCallback, useEffect, useState } from "react";
import { FaBell, FaCheck, FaCheckDouble, FaRotate } from "react-icons/fa6";
import api from "../config/api.js";
import { useLanguage } from "../context/LanguageContext.jsx";

// Notify the dashboard sidebar after a server-confirmed unread count update.
function publishUnreadCount(unreadCount) {
  window.dispatchEvent(
    new CustomEvent("notifications:unread-count", { detail: { unreadCount } }),
  );
}

// Display only the authenticated user's notifications and let them mark notices read.
function NotificationsPage() {
  const { t, formatDate, localizeRecord } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Fetch every page of this user's notifications and the authoritative unread count.
  const loadNotifications = useCallback(async () => {
    try {
      const firstResponse = await api.get("/notifications", {
        params: { page: 1, limit: 50 },
      });
      const firstPage = firstResponse.data?.notifications || [];
      const totalPages = firstResponse.data?.pagination?.totalPages || 1;
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
          api.get("/notifications", { params: { page: index + 2, limit: 50 } }),
        ),
      );
      const allNotifications = [
        ...firstPage,
        ...remainingPages.flatMap(
          (response) => response.data?.notifications || [],
        ),
      ];
      const countResponse = await api.get("/notifications/unread-count");
      const count = Number(countResponse.data?.unreadCount) || 0;

      setNotifications(allNotifications);
      setUnreadCount(count);
      publishUnreadCount(count);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ||
          "Unable to load notifications. Please try again.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load this user's notifications when the page opens.
  useEffect(() => {
    const requestId = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(requestId);
  }, [loadNotifications]);

  // Mark a notification read after the server confirms it, then refresh the count.
  async function handleMarkRead(notification) {
    if (notification.isRead || busyId) return;
    setBusyId(String(notification._id));
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await api.patch(`/notifications/${notification._id}/read`);
      const nextCount = Math.max(0, unreadCount - 1);
      setNotifications((current) =>
        current.map((item) =>
          String(item._id) === String(notification._id)
            ? { ...item, isRead: true, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount(nextCount);
      publishUnreadCount(nextCount);
      try {
        const countResponse = await api.get("/notifications/unread-count");
        const count = Number(countResponse.data?.unreadCount) || 0;
        setUnreadCount(count);
        publishUnreadCount(count);
      } catch {
        // The confirmed read remains reflected while the server count is unavailable.
      }
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ||
          "Unable to mark this notification as read.",
      );
    } finally {
      setBusyId("");
    }
  }

  // Mark all of this user's unread notifications read using the existing endpoint.
  async function handleMarkAllRead() {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await api.patch("/notifications/read-all");
      const nextCount = Math.max(
        0,
        unreadCount - (Number(response.data?.updatedCount) || 0),
      );
      setNotifications((current) =>
        current.map((item) =>
          item.isRead
            ? item
            : {
                ...item,
                isRead: true,
                readAt: new Date().toISOString(),
              },
        ),
      );
      setUnreadCount(nextCount);
      publishUnreadCount(nextCount);
      try {
        const countResponse = await api.get("/notifications/unread-count");
        const count = Number(countResponse.data?.unreadCount) || 0;
        setUnreadCount(count);
        publishUnreadCount(count);
      } catch {
        // The bulk update response provides the count change if refresh is unavailable.
      }
      setSuccessMessage(
        response.data?.message || "All notifications marked as read.",
      );
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ||
          "Unable to mark notifications as read.",
      );
    } finally {
      setIsMarkingAll(false);
    }
  }

  // Refresh the list and unread count from the authenticated API.
  async function handleRefresh() {
    setIsRefreshing(true);
    await loadNotifications();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#2B4593]">
            <LocalizedText text={"Your activity"} />
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172554] sm:text-3xl">
            {t("Notifications")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <LocalizedText
              text={
                "Updates about your account and container clearance activity."
              }
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FaRotate className={isRefreshing ? "animate-spin" : ""} />{" "}
            <LocalizedText text={"Refresh"} />
          </button>
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={isMarkingAll || unreadCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2B4593] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#21377a] disabled:opacity-50"
          >
            <FaCheckDouble /> <LocalizedText text={"Mark all read"} />
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-blue-100 bg-gradient-to-r from-white to-blue-50 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          <LocalizedText text={"Unread notifications"} />
        </p>
        <p className="mt-1 text-3xl font-black text-[#172554]">{unreadCount}</p>
      </section>
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <p
            role="status"
            className="p-12 text-center text-sm font-semibold text-slate-500"
          >
            <LocalizedText text={"Loading notifications…"} />
          </p>
        ) : notifications.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FaBell className="mx-auto text-3xl text-slate-300" />
            <h2 className="mt-3 font-extrabold text-[#172554]">
              <LocalizedText text={"You’re all caught up"} />
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              <LocalizedText
                text={"New updates about your activity will appear here."}
              />
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <article
                key={notification._id}
                className={`p-4 transition sm:p-5 ${notification.isRead ? "bg-white" : "bg-blue-50/60"}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl ${notification.isRead ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-[#2B4593]"}`}
                  >
                    <FaBell />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-extrabold text-[#172554]">
                        {localizeRecord(
                          notification,
                          "titleEnglish",
                          "titleSomali",
                        ) || t("Notification")}
                      </h2>
                      {!notification.isRead && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#2B4593]">
                          <LocalizedText text={"Unread"} />
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {localizeRecord(
                        notification,
                        "messageEnglish",
                        "messageSomali",
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                      <span>
                        {formatDate(notification.createdAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      {notification.type && (
                        <span className="rounded-full bg-slate-100 px-2 py-1">
                          {t(notification.type.replaceAll("_", " "))}
                        </span>
                      )}
                      {notification.container?.containerNumber && (
                        <span>
                          {t("Container")}{" "}
                          {notification.container.containerNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  {!notification.isRead && (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(notification)}
                      disabled={Boolean(busyId)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-[#2B4593] hover:bg-blue-50 disabled:opacity-50"
                      aria-label="Mark notification as read"
                    >
                      <FaCheck />{" "}
                      <span className="hidden sm:inline">
                        <LocalizedText text={"Mark read"} />
                      </span>
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default NotificationsPage;
