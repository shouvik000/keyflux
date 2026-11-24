import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  KeyRound,
  RefreshCw,
  Server,
  ShieldAlert,
  TrendingUp,
  XCircle
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  getAnalyticsDashboard,
  getAnalyticsLogs
} from "../services/analyticsApi";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDuration(value) {
  return `${Number(value || 0).toFixed(2)} ms`;
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString();
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

export default function AnalyticsPage({
  project,
  user,
  onBack,
  onLogout
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [days, setDays] = useState(7);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState("");
  const [logsPage, setLogsPage] = useState(1);

  async function loadDashboard(selectedDays = days, key = apiKey) {
    if (!key.trim()) {
      setError("Enter an API key to load analytics.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getAnalyticsDashboard(key, selectedDays);

      setDashboard(result);
      setDays(selectedDays);
      setLogsPage(1);
    } catch (requestError) {
      setDashboard(null);

      const message =
        requestError.response?.data?.error?.message ||
        requestError.response?.data?.message ||
        requestError.message ||
        "Unable to load analytics.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function changeLogsPage(nextPage) {
    if (!apiKey.trim() || !dashboard) return;

    setLogsLoading(true);

    try {
      const result = await getAnalyticsLogs(apiKey, {
        days,
        page: nextPage,
        limit: 10
      });

      setDashboard((current) => ({
        ...current,
        logs: result
      }));

      setLogsPage(nextPage);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ||
        requestError.response?.data?.message ||
        "Unable to load request logs."
      );
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      setApiKey("");
    };
  }, []);

  const overview = dashboard?.overview || {};
  const performance = dashboard?.performance || {};
  const endpoints = Array.isArray(dashboard?.endpoints)
    ? dashboard.endpoints
    : [];
  const timeline = Array.isArray(dashboard?.timeline)
    ? dashboard.timeline
    : [];
  const logs = Array.isArray(dashboard?.logs?.logs)
    ? dashboard.logs.logs
    : [];
  const pagination = dashboard?.logs?.pagination || {};

  const chartData = timeline.map((item) => ({
    ...item,
    date: item.date
      ? new Date(item.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        })
      : "-"
  }));

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
              Project analytics
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {project?.name || "Analytics"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Monitor API traffic, performance and request activity.
            </p>
          </div>

          {dashboard && (
            <div className="flex items-center gap-2">
              {[7, 30, 90].map((period) => (
                <button
                  key={period}
                  onClick={() => loadDashboard(period)}
                  disabled={loading}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    days === period
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {period} days
                </button>
              ))}

              <button
                onClick={() => loadDashboard(days)}
                disabled={loading}
                title="Refresh analytics"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <RefreshCw
                  size={17}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
            </div>
          )}
        </div>

        {!dashboard && (
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
                  Enter a project API key to retrieve its analytics.
                </p>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadDashboard(7);
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
                {loading ? "Connecting..." : "Load analytics"}
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

        {loading && !dashboard && (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
            <RefreshCw size={25} className="mx-auto animate-spin text-slate-500" />
            <p className="mt-3 text-sm text-slate-500">
              Loading analytics...
            </p>
          </div>
        )}

        {dashboard && (
          <>
            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Total requests"
                value={formatNumber(overview.total_requests)}
                description="Requests in selected period"
                icon={Activity}
              />

              <MetricCard
                title="Successful requests"
                value={formatNumber(overview.successful_requests)}
                description="Successful API responses"
                icon={CheckCircle2}
              />

              <MetricCard
                title="Failed requests"
                value={formatNumber(overview.failed_requests)}
                description={`${Number(overview.error_rate_percentage || 0).toFixed(2)}% error rate`}
                icon={XCircle}
              />

              <MetricCard
                title="Average response time"
                value={formatDuration(overview.average_response_time_ms)}
                description="Average API response time"
                icon={Clock3}
              />
            </div>

            <section className="mb-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Request activity
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    API requests over the selected period
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-800" />
                    Total requests
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Successful
                  </span>
                </div>
              </div>

              <div className="h-72 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="requestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#334155" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#334155" stopOpacity={0} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="total_requests"
                        name="Total requests"
                        stroke="#334155"
                        fill="url(#requestGradient)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="successful_requests"
                        name="Successful"
                        stroke="#10b981"
                        fill="none"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No request activity available for this period.
                  </div>
                )}
              </div>
            </section>

            <section className="mb-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h3 className="font-semibold text-slate-900">
                  Performance metrics
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Response-time distribution
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Average", performance.average_response_time_ms],
                  ["P50", performance.p50_response_time_ms],
                  ["P95", performance.p95_response_time_ms],
                  ["P99", performance.p99_response_time_ms]
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {formatDuration(value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-2">
                <Server size={19} className="text-slate-500" />
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Endpoint analytics
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Most frequently used API endpoints
                  </p>
                </div>
              </div>

              {endpoints.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-3 pr-4 font-medium">Endpoint</th>
                        <th className="py-3 pr-4 font-medium">Method</th>
                        <th className="py-3 pr-4 font-medium">Requests</th>
                        <th className="py-3 pr-4 font-medium">Errors</th>
                        <th className="py-3 font-medium">Avg. response</th>
                      </tr>
                    </thead>

                    <tbody>
                      {endpoints.map((endpoint, index) => (
                        <tr
                          key={`${endpoint.http_method}-${endpoint.request_path}-${index}`}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-800">
                            {endpoint.request_path}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                              {endpoint.http_method}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {formatNumber(endpoint.total_requests)}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {formatNumber(
                              Number(endpoint.client_errors || 0) +
                              Number(endpoint.server_errors || 0)
                            )}
                          </td>
                          <td className="py-3 text-slate-600">
                            {formatDuration(endpoint.average_response_time_ms)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  No endpoint data available yet.
                </p>
              )}
            </section>

            <section className="mb-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-2">
                <BarChart3 size={19} className="text-slate-500" />
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Slowest endpoints
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Endpoints ranked by P95 response time
                  </p>
                </div>
              </div>

              {Array.isArray(performance.slowest_endpoints) &&
              performance.slowest_endpoints.length > 0 ? (
                <div className="space-y-3">
                  {performance.slowest_endpoints.map((endpoint, index) => (
                    <div
                      key={`${endpoint.http_method}-${endpoint.request_path}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4"
                    >
                      <div>
                        <p className="font-medium text-slate-800">
                          {endpoint.request_path}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {endpoint.http_method} · {formatNumber(endpoint.total_requests)} requests
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatDuration(endpoint.p95_response_time_ms)}
                        </p>
                        <p className="text-xs text-slate-400">P95 response</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-slate-400">
                  No performance data available yet.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Recent API requests
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Request history for this project
                  </p>
                </div>

                <span className="text-xs text-slate-400">
                  {formatNumber(pagination.total)} total logs
                </span>
              </div>

              {logs.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                          <th className="py-3 pr-4 font-medium">Endpoint</th>
                          <th className="py-3 pr-4 font-medium">Method</th>
                          <th className="py-3 pr-4 font-medium">Status</th>
                          <th className="py-3 pr-4 font-medium">Response time</th>
                          <th className="py-3 font-medium">Date</th>
                        </tr>
                      </thead>

                      <tbody>
                        {logs.map((log, index) => (
                          <tr
                            key={`${log.created_at}-${index}`}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="py-3 pr-4 font-medium text-slate-800">
                              {log.request_path}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {log.http_method}
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                  log.status_code < 400
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {log.status_code}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {formatDuration(log.response_time_ms)}
                            </td>
                            <td className="py-3 text-slate-500">
                              {formatDate(log.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <p className="text-xs text-slate-500">
                      Page {pagination.page || logsPage} of {pagination.totalPages || 1}
                    </p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => changeLogsPage(logsPage - 1)}
                        disabled={
                          logsLoading ||
                          !(pagination.hasPreviousPage ?? logsPage > 1)
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Previous
                      </button>

                      <button
                        onClick={() => changeLogsPage(logsPage + 1)}
                        disabled={
                          logsLoading ||
                          !(pagination.hasNextPage ?? false)
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  No API request logs available yet.
                </p>
              )}
            </section>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  setDashboard(null);
                  setApiKey("");
                  setError("");
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                Disconnect API key
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
