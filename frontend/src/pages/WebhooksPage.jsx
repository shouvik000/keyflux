
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BellRing,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Webhook,
  X
} from "lucide-react";

import {
  getProjectWebhooks,
  createProjectWebhook,
  updateProjectWebhook,
  deleteProjectWebhook,
  getWebhookDeliveries,
  retryWebhookDelivery
} from "../services/webhooksApi";

const AVAILABLE_EVENTS = [
  "RATE_LIMIT_WARNING",
  "RATE_LIMIT_EXCEEDED"
];

const DELIVERY_LIMIT = 20;

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getErrorMessage(error, fallback) {
  return (
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message ||
    fallback
  );
}

function StatusBadge({ status }) {
  const styles = {
    SUCCESS: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-red-50 text-red-700",
    PENDING: "bg-amber-50 text-amber-700"
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status || "UNKNOWN"}
    </span>
  );
}

function EventLabel({ event }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
      {event === "RATE_LIMIT_WARNING"
        ? "Rate limit warning"
        : "Rate limit exceeded"}
    </span>
  );
}

function MetricCard({ title, value, description, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
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

export default function WebhooksPage({
  project,
  user,
  onBack,
  onLogout
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [webhooks, setWebhooks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState([]);
  const [isActive, setIsActive] = useState(true);

  const [createdSecret, setCreatedSecret] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);

  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [deliveriesData, setDeliveriesData] = useState(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryOffset, setDeliveryOffset] = useState(0);
  const [retryingId, setRetryingId] = useState(null);

  const [notice, setNotice] = useState("");

  async function loadWebhooks(key = apiKey) {
    if (!key.trim()) {
      setError("Enter a project API key to load webhooks.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await getProjectWebhooks(key);
      setWebhooks(result);
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Unable to load webhooks.")
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingWebhook(null);
    setName("");
    setUrl("");
    setEvents([]);
    setIsActive(true);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(webhook) {
    setEditingWebhook(webhook);
    setName(webhook.name || "");
    setUrl(webhook.url || "");
    setEvents(Array.isArray(webhook.events) ? webhook.events : []);
    setIsActive(webhook.is_active);
    setFormError("");
    setShowForm(true);
  }

  function toggleEvent(eventName) {
    setEvents((current) =>
      current.includes(eventName)
        ? current.filter((item) => item !== eventName)
        : [...current, eventName]
    );
  }

  async function saveWebhook(event) {
    event.preventDefault();

    if (!name.trim() || !url.trim()) {
      setFormError("Name and URL are required.");
      return;
    }

    if (events.length === 0) {
      setFormError("Select at least one event.");
      return;
    }

    setSaving(true);
    setFormError("");
    setError("");

    try {
      if (editingWebhook) {
        await updateProjectWebhook(apiKey, editingWebhook.id, {
          name: name.trim(),
          url: url.trim(),
          events,
          isActive
        });

        setNotice("Webhook updated successfully.");
      } else {
        const result = await createProjectWebhook(apiKey, {
          name: name.trim(),
          url: url.trim(),
          events
        });

        setCreatedSecret(result.secret || "");
        setSecretCopied(false);
        setNotice("Webhook created successfully.");
      }

      setShowForm(false);
      await loadWebhooks();
    } catch (requestError) {
      setFormError(
        getErrorMessage(requestError, "Unable to save webhook.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(webhook) {
    const confirmed = window.confirm(
      `Delete webhook "${webhook.name}"? Its delivery history will also be affected.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await deleteProjectWebhook(apiKey, webhook.id);

      setWebhooks((current) =>
        current.filter((item) => item.id !== webhook.id)
      );

      if (selectedWebhook?.id === webhook.id) {
        setSelectedWebhook(null);
        setDeliveriesData(null);
      }

      setNotice("Webhook deleted successfully.");
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Unable to delete webhook.")
      );
    }
  }

  async function toggleWebhookStatus(webhook) {
    setError("");
    setNotice("");

    try {
      const updated = await updateProjectWebhook(
        apiKey,
        webhook.id,
        { isActive: !webhook.is_active }
      );

      setWebhooks((current) =>
        current.map((item) =>
          item.id === webhook.id ? updated : item
        )
      );

      setNotice(
        updated.is_active
          ? "Webhook activated."
          : "Webhook deactivated."
      );
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Unable to update webhook status.")
      );
    }
  }

  async function loadDeliveries(
    webhook,
    offset = deliveryOffset
  ) {
    setSelectedWebhook(webhook);
    setDeliveryLoading(true);
    setDeliveryError("");
    setDeliveriesData(null);

    try {
      const result = await getWebhookDeliveries(
        apiKey,
        webhook.id,
        { limit: DELIVERY_LIMIT, offset }
      );

      setDeliveriesData(result);
      setDeliveryOffset(offset);
    } catch (requestError) {
      setDeliveryError(
        getErrorMessage(requestError, "Unable to load delivery history.")
      );
    } finally {
      setDeliveryLoading(false);
    }
  }

  async function handleRetry(delivery) {
    if (!selectedWebhook) return;

    setRetryingId(delivery.id);
    setDeliveryError("");

    try {
      await retryWebhookDelivery(
        apiKey,
        selectedWebhook.id,
        delivery.id
      );

      await loadDeliveries(selectedWebhook, deliveryOffset);
      setNotice("Delivery queued for retry.");
    } catch (requestError) {
      setDeliveryError(
        getErrorMessage(
          requestError,
          "Unable to retry delivery. It may no longer be eligible."
        )
      );
    } finally {
      setRetryingId(null);
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(createdSecret);
      setSecretCopied(true);
    } catch {
      setError("Unable to copy secret. Please copy it manually.");
    }
  }

  useEffect(() => {
    return () => {
      setApiKey("");
      setCreatedSecret("");
    };
  }, []);

  const activeCount = Array.isArray(webhooks)
    ? webhooks.filter((item) => item.is_active).length
    : 0;

  const inactiveCount = Array.isArray(webhooks)
    ? webhooks.length - activeCount
    : 0;

  const deliveries = Array.isArray(deliveriesData?.deliveries)
    ? deliveriesData.deliveries
    : [];

  const canGoNext = deliveries.length === DELIVERY_LIMIT;

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
              Event delivery integrations
            </p>

            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {project?.name || "Webhooks"}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Manage webhook endpoints and monitor event deliveries.
            </p>
          </div>

          {webhooks && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => loadWebhooks()}
                disabled={loading}
                className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                title="Refresh webhooks"
              >
                <RefreshCw
                  size={17}
                  className={loading ? "animate-spin" : ""}
                />
              </button>

              <button
                onClick={openCreateForm}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                <Plus size={17} />
                Create webhook
              </button>
            </div>
          )}
        </div>

        {!webhooks && (
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
                  Enter a project API key to manage its webhooks.
                </p>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadWebhooks();
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your kf_live_ API key"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />

              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {showKey ? "Hide key" : "Show key"}
              </button>

              <button
                type="submit"
                disabled={loading || !apiKey.trim()}
                className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Load webhooks"}
              </button>
            </form>

            <p className="mt-3 text-xs text-slate-400">
              Your API key remains in temporary page memory and is not saved
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

        {notice && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <p>{notice}</p>
          </div>
        )}

        {loading && !webhooks && (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
            <LoaderCircle size={25} className="mx-auto animate-spin text-slate-500" />
            <p className="mt-3 text-sm text-slate-500">
              Loading webhooks...
            </p>
          </div>
        )}

        {webhooks && (
          <>
            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                title="Total webhooks"
                value={webhooks.length}
                description="Registered endpoints"
                icon={Webhook}
              />

              <MetricCard
                title="Active webhooks"
                value={activeCount}
                description="Currently enabled"
                icon={CheckCircle2}
              />

              <MetricCard
                title="Inactive webhooks"
                value={inactiveCount}
                description="Currently disabled"
                icon={Clock3}
              />
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Webhook endpoints
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Configure destinations for project events.
                  </p>
                </div>

                <span className="text-xs font-medium text-slate-500">
                  {webhooks.length} total
                </span>
              </div>

              {webhooks.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <Webhook size={32} className="mx-auto text-slate-400" />
                  <h4 className="mt-4 font-semibold text-slate-800">
                    No webhooks yet
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Create a webhook to receive project event notifications.
                  </p>
                  <button
                    onClick={openCreateForm}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    <Plus size={16} />
                    Create your first webhook
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {webhooks.map((webhook) => (
                    <article
                      key={webhook.id}
                      className="px-6 py-5"
                    >
                      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <h4 className="font-semibold text-slate-900">
                              {webhook.name}
                            </h4>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                webhook.is_active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {webhook.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>

                          <p className="mt-2 break-all text-sm text-slate-500">
                            {webhook.url}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {(webhook.events || []).map((event) => (
                              <EventLabel key={event} event={event} />
                            ))}
                          </div>

                          <p className="mt-3 text-xs text-slate-400">
                            Created {formatDate(webhook.created_at)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => loadDeliveries(webhook, 0)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Clock3 size={15} />
                              Deliveries
                            </span>
                          </button>

                          <button
                            onClick={() => openEditForm(webhook)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                            title="Edit webhook"
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            onClick={() => toggleWebhookStatus(webhook)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                          >
                            {webhook.is_active ? "Disable" : "Enable"}
                          </button>

                          <button
                            onClick={() => handleDelete(webhook)}
                            className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                            title="Delete webhook"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {selectedWebhook && (
          <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Delivery history
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">
                  {selectedWebhook.name}
                </h3>
              </div>

              <button
                onClick={() => {
                  setSelectedWebhook(null);
                  setDeliveriesData(null);
                  setDeliveryError("");
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close delivery history"
              >
                <X size={18} />
              </button>
            </div>

            {deliveryError && (
              <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {deliveryError}
              </div>
            )}

            {deliveryLoading ? (
              <div className="py-14 text-center">
                <LoaderCircle size={24} className="mx-auto animate-spin text-slate-500" />
                <p className="mt-3 text-sm text-slate-500">
                  Loading delivery history...
                </p>
              </div>
            ) : deliveriesData && (
              <>
                {deliveries.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-slate-500">
                    No delivery records found for this webhook.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {deliveries.map((delivery) => {
                      const canRetry =
                        delivery.status === "FAILED" &&
                        delivery.attempts < 5;

                      return (
                        <article key={delivery.id} className="px-6 py-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  Delivery #{delivery.id}
                                </span>
                                <StatusBadge status={delivery.status} />
                                {delivery.alert_type && (
                                  <EventLabel event={delivery.alert_type} />
                                )}
                              </div>

                              <p className="mt-2 text-xs text-slate-500">
                                {delivery.attempts} / 5 attempts
                                {" · "}
                                HTTP {delivery.response_status || "-"}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                Created {formatDate(delivery.created_at)}
                              </p>

                              {delivery.delivered_at && (
                                <p className="mt-1 text-xs text-slate-400">
                                  Delivered {formatDate(delivery.delivered_at)}
                                </p>
                              )}

                              {delivery.next_retry_at && (
                                <p className="mt-1 text-xs text-amber-600">
                                  Next retry {formatDate(delivery.next_retry_at)}
                                </p>
                              )}
                            </div>

                            {canRetry && (
                              <button
                                onClick={() => handleRetry(delivery)}
                                disabled={retryingId === delivery.id}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                <RotateCcw
                                  size={15}
                                  className={
                                    retryingId === delivery.id
                                      ? "animate-spin"
                                      : ""
                                  }
                                />
                                Retry
                              </button>
                            )}
                          </div>

                          {delivery.response_body && (
                            <details className="mt-4">
                              <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">
                                View response body
                              </summary>
                              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                                {delivery.response_body}
                              </pre>
                            </details>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
                  <span className="text-xs text-slate-500">
                    Showing {deliveries.length} records from offset {deliveryOffset}
                  </span>

                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        loadDeliveries(
                          selectedWebhook,
                          Math.max(0, deliveryOffset - DELIVERY_LIMIT)
                        )
                      }
                      disabled={deliveryOffset === 0 || deliveryLoading}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      aria-label="Previous deliveries"
                    >
                      <ChevronLeft size={17} />
                    </button>

                    <button
                      onClick={() =>
                        loadDeliveries(
                          selectedWebhook,
                          deliveryOffset + DELIVERY_LIMIT
                        )
                      }
                      disabled={!canGoNext || deliveryLoading}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      aria-label="Next deliveries"
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingWebhook ? "Edit webhook" : "Create webhook"}
              </h3>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveWebhook} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Webhook name
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder="Production notifications"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  HTTPS endpoint URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/webhooks/keyflux"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Public HTTPS endpoints are required. Localhost and private
                  network destinations are not allowed.
                </p>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Subscribe to events
                </p>

                <div className="space-y-3">
                  {AVAILABLE_EVENTS.map((eventName) => (
                    <label
                      key={eventName}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <input
                        type="checkbox"
                        checked={events.includes(eventName)}
                        onChange={() => toggleEvent(eventName)}
                        className="mt-1 h-4 w-4 accent-slate-900"
                      />

                      <span>
                        <span className="block text-sm font-medium text-slate-800">
                          {eventName === "RATE_LIMIT_WARNING"
                            ? "Rate limit warning"
                            : "Rate limit exceeded"}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {eventName === "RATE_LIMIT_WARNING"
                            ? "Triggered when usage reaches the warning threshold."
                            : "Triggered when the API rate limit is exceeded."}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {editingWebhook && (
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                    className="h-4 w-4 accent-slate-900"
                  />
                  Webhook is active
                </label>
              )}

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingWebhook
                      ? "Save changes"
                      : "Create webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdSecret && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700">
                <CheckCircle2 size={22} />
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">
                  Webhook created
                </h3>
                <p className="text-sm text-slate-500">
                  Your signing secret is ready.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">
                Save this secret now
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-700">
                This secret is shown only once. KeyFlux does not provide a way
                to retrieve it later. Store it securely in your endpoint's
                environment variables.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                readOnly
                value={createdSecret}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 font-mono text-xs text-slate-700"
              />

              <button
                onClick={copySecret}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                {secretCopied ? <Check size={16} /> : <Copy size={16} />}
                {secretCopied ? "Copied" : "Copy"}
              </button>
            </div>

            <button
              onClick={() => {
                setCreatedSecret("");
                setSecretCopied(false);
              }}
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              I have saved my secret
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
