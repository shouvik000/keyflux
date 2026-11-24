import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  X
} from "lucide-react";

import {
  getProjectAlerts,
  getProjectAlertById
} from "../services/alertsApi";

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString();
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function getAlertLabel(type) {
  if (type === "RATE_LIMIT_WARNING") {
    return "Rate limit warning";
  }

  if (type === "RATE_LIMIT_EXCEEDED") {
    return "Rate limit exceeded";
  }

  return type || "Unknown alert";
}

function AlertBadge({ type }) {
  const warning = type === "RATE_LIMIT_WARNING";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        warning
          ? "bg-amber-50 text-amber-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {warning ? (
        <AlertTriangle size={13} />
      ) : (
        <ShieldAlert size={13} />
      )}
      {warning ? "Warning" : "Exceeded"}
    </span>
  );
}

function MetricCard({ title, value, description, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>

        <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage({
  project,
  user,
  onBack,
  onLogout
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [alertsData, setAlertsData] = useState(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [selectedAlert, setSelectedAlert] = useState(null);

  async function loadAlerts(
    selectedPage = page,
    selectedFilter = filter,
    key = apiKey
  ) {
    if (!key.trim()) {
      setError("Enter an API key to load project alerts.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getProjectAlerts(key, {
        page: selectedPage,
        limit: 10,
        alertType: selectedFilter || undefined
      });

      setAlertsData(result);
      setPage(selectedPage);
      setFilter(selectedFilter);
      setSelectedAlert(null);
    } catch (requestError) {
      const message =
        requestError.response?.data?.error?.message ||
        requestError.response?.data?.message ||
        requestError.message ||
        "Unable to load project alerts.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function openAlertDetails(alert) {
    setDetailLoading(true);
    setDetailError("");
    setSelectedAlert(null);

    try {
      const result = await getProjectAlertById(apiKey, alert.id);
      setSelectedAlert(result);
    } catch (requestError) {
      setDetailError(
        requestError.response?.data?.error?.message ||
        requestError.response?.data?.message ||
        requestError.message ||
        "Unable to load alert details."
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function changeFilter(value) {
    setFilter(value);
    setPage(1);
    loadAlerts(1, value);
  }

  useEffect(() => {
    return () => {
      setApiKey("");
    };
  }, []);

  const alerts = Array.isArray(alertsData?.alerts)
    ? alertsData.alerts
    : [];

  const pagination = alertsData?.pagination || {};

  const warningCount = alerts.filter(
    (alert) => alert.alert_type === "RATE_LIMIT_WARNING"
  ).length;

  const exceededCount = alerts.filter(
    (alert) => alert.alert_type === "RATE_LIMIT_EXCEEDED"
  ).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Activity size={19} />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                keyflux
              </h1>
              <p className="text-xs text-slate-500">API Management</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">
                {user?.name || "Account"}
              </p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>

            <button
              onClick={onLogout}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to projects
        </button>

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Project notifications
            </p>

            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {project?.name || "Alerts"}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Monitor API rate-limit warnings and exceeded limits.
            </p>
          </div>

          {alertsData && (
            <div className="flex items-center gap-2">
              <select
                value={filter}
                onChange={(event) => changeFilter(event.target.value)}
                disabled={loading}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                <option value="">All alert types</option>
                <option value="RATE_LIMIT_WARNING">
                  Rate limit warnings
                </option>
                <option value="RATE_LIMIT_EXCEEDED">
                  Rate limit exceeded
                </option>
              </select>

              <button
                onClick={() => loadAlerts(page, filter)}
                disabled={loading}
                title="Refresh alerts"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <RefreshCw
                  size={17}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
            </div>
          )}
        </div>

        {!alertsData && (
          <section className="mb-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-slate-100 p-2.5 text-slate-700">
                <KeyRound size={20} />
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">
                  Connect your API key
                </h3>

                <p className="text-sm text-slate-500">
                  Enter a project API key to retrieve its alerts.
                </p>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadAlerts(1, filter);
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your kf_live_ API key"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />

              <button
                type="button"
                onClick={() => setShowKey((current) => !current)}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {showKey ? "Hide key" : "Show key"}
              </button>

              <button
                type="submit"
                disabled={loading || !apiKey.trim()}
                className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Load alerts"}
              </button>
            </form>

            <p className="mt-3 text-xs text-slate-400">
              Your key stays in this page's temporary memory and is not saved
              to local storage.
            </p>
          </section>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading && !alertsData && (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
            <RefreshCw size={25} className="mx-auto animate-spin text-slate-500" />
            <p className="mt-3 text-sm text-slate-500">
              Loading project alerts...
            </p>
          </div>
        )}

        {alertsData && (
          <>
            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                title="Total alerts"
                value={formatNumber(pagination.total)}
                description="Matching project alerts"
                icon={Bell}
              />

              <MetricCard
                title="Warnings"
                value={formatNumber(warningCount)}
                description="On this page"
                icon={AlertTriangle}
              />

              <MetricCard
                title="Rate limit exceeded"
                value={formatNumber(exceededCount)}
                description="On this page"
                icon={ShieldAlert}
              />
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Alert history
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Recorded rate-limit events for this project.
                  </p>
                </div>

                <span className="text-xs font-medium text-slate-500">
                  {formatNumber(pagination.total)} total alerts
                </span>
              </div>

              {alerts.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <CheckCircle2
                    size={30}
                    className="mx-auto text-slate-400"
                  />

                  <h4 className="mt-3 font-semibold text-slate-800">
                    No alerts found
                  </h4>

                  <p className="mt-1 text-sm text-slate-500">
                    There are no alerts matching the selected filter.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {alerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => openAlertDetails(alert)}
                      className="flex w-full flex-col gap-3 px-6 py-5 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`mt-0.5 rounded-lg p-2 ${
                            alert.alert_type === "RATE_LIMIT_WARNING"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {alert.alert_type === "RATE_LIMIT_WARNING" ? (
                            <AlertTriangle size={19} />
                          ) : (
                            <ShieldAlert size={19} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {getAlertLabel(alert.alert_type)}
                            </p>

                            <AlertBadge type={alert.alert_type} />
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {formatNumber(alert.usage_count)} requests against
                            a limit of {formatNumber(alert.rate_limit)}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Alert #{alert.id}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500 sm:pl-4">
                        <Clock3 size={14} />
                        {formatDate(alert.created_at)}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {pagination.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
                  <p className="text-sm text-slate-500">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadAlerts(page - 1, filter)}
                      disabled={!pagination.hasPreviousPage || loading}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>

                    <button
                      onClick={() => loadAlerts(page + 1, filter)}
                      disabled={!pagination.hasNextPage || loading}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {(selectedAlert || detailLoading || detailError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="font-semibold text-slate-900">
                Alert details
              </h3>

              <button
                onClick={() => {
                  setSelectedAlert(null);
                  setDetailError("");
                }}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close alert details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="py-8 text-center">
                  <RefreshCw
                    size={24}
                    className="mx-auto animate-spin text-slate-500"
                  />
                  <p className="mt-3 text-sm text-slate-500">
                    Loading alert details...
                  </p>
                </div>
              ) : detailError ? (
                <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                  {detailError}
                </p>
              ) : selectedAlert ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Alert type
                    </p>

                    <div className="mt-2">
                      <AlertBadge type={selectedAlert.alert_type} />
                    </div>

                    <p className="mt-2 font-semibold text-slate-900">
                      {getAlertLabel(selectedAlert.alert_type)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Usage count</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">
                        {formatNumber(selectedAlert.usage_count)}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Rate limit</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">
                        {formatNumber(selectedAlert.rate_limit)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Alert ID</span>
                      <span className="font-medium text-slate-800">
                        #{selectedAlert.id}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">API key ID</span>
                      <span className="font-medium text-slate-800">
                        {selectedAlert.api_key_id}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Window</span>
                      <span className="font-medium text-slate-800">
                        {formatNumber(selectedAlert.window_ms)} ms
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Created</span>
                      <span className="text-right font-medium text-slate-800">
                        {formatDate(selectedAlert.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
