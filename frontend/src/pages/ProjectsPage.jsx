import { useEffect, useState } from "react";
import {
  FolderKanban,
  Plus,
  Pencil,
  Trash2,
  LogOut,
  X,
  FolderOpen,
  RefreshCw,
  KeyRound,
  BarChart3,
  Bell,
  Webhook,
  Copy,
  Check
} from "lucide-react";
import api from "../services/api";

export default function ProjectsPage({ user, onLogout, onOpenAnalytics, onOpenAlerts, onOpenWebhooks }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // API key state
  const [keyProject, setKeyProject] = useState(null);
  const [keyName, setKeyName] = useState("");
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadProjects() {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/projects");
      setProjects(response.data.data.projects);
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "Unable to load your projects."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setError("");
    setShowForm(true);
  }

  function openEditForm(project) {
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description || "");
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setDescription("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        await api.patch(`/projects/${editingId}`, {
          name: name.trim(),
          description: description.trim() || null
        });
      } else {
        await api.post("/projects", {
          name: name.trim(),
          description: description.trim() || null
        });
      }

      closeForm();
      await loadProjects();
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "Unable to save the project."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(project) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name}"?`
    );

    if (!confirmed) return;

    setError("");

    try {
      await api.delete(`/projects/${project.id}`);
      setProjects((current) =>
        current.filter((item) => item.id !== project.id)
      );
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "Unable to delete the project."
      );
    }
  }

  function openKeyForm(project) {
    setKeyProject(project);
    setKeyName(`${project.name} Key`);
    setGeneratedKey("");
    setKeyError("");
    setCopied(false);
  }

  function closeKeyModal() {
    setKeyProject(null);
    setKeyName("");
    setGeneratedKey("");
    setKeyError("");
    setCopied(false);
  }

  async function handleGenerateKey(event) {
    event.preventDefault();
    setKeyError("");

    if (!keyName.trim()) {
      setKeyError("API key name is required.");
      return;
    }

    setGeneratingKey(true);

    try {
      const response = await api.post(
        `/projects/${keyProject.id}/keys`,
        {
          name: keyName.trim()
        }
      );

      setGeneratedKey(response.data.data.key);
    } catch (err) {
      setKeyError(
        err.response?.data?.error?.message ||
          "Unable to generate API key."
      );
    } finally {
      setGeneratingKey(false);
    }
  }

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
    } catch {
      setKeyError(
        "Unable to copy automatically. Please select and copy the key manually."
      );
    }
  }

  function formatDate(date) {
    if (!date) return "Recently created";

    return new Date(date).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <FolderKanban size={19} />
            </div>

            <span className="text-xl font-semibold tracking-tight">
              keyflux
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Workspace
            </p>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Your projects
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Create and manage your API projects in one place.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <Plus size={17} />
            New project
          </button>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Total projects</p>
            <p className="mt-2 text-3xl font-semibold">
              {loading ? "..." : projects.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:col-span-2">
            <p className="text-sm text-slate-500">Signed in as</p>
            <p className="mt-2 truncate text-base font-medium">
              {user.email}
            </p>
          </div>
        </div>

        {error && !showForm && (
          <div
            role="alert"
            className="mt-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}

            <button
              onClick={loadProjects}
              className="flex items-center gap-1 font-medium"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        )}

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">All projects</h2>

            <span className="text-sm text-slate-500">
              {projects.length} projects
            </span>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
              <p className="mt-4 text-sm text-slate-500">
                Loading projects...
              </p>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <FolderOpen size={23} />
              </div>

              <h3 className="mt-4 font-semibold">
                No projects yet
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Create your first project to start managing APIs.
              </p>

              <button
                onClick={openCreateForm}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                <Plus size={16} />
                Create project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {projects.map((project) => (
                <article
                  key={project.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                        <FolderKanban size={19} />
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {project.name}
                        </h3>

                        <p className="mt-1 text-xs text-slate-500">
                          Project #{project.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => openEditForm(project)}
                        aria-label={`Edit ${project.name}`}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        onClick={() => handleDelete(project)}
                        aria-label={`Delete ${project.name}`}
                        className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <p className="mt-5 min-h-10 text-sm leading-5 text-slate-500">
                    {project.description || "No description provided."}
                  </p>

                  <div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">
                    Created {formatDate(project.created_at)}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button
                      onClick={() => openKeyForm(project)}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:bg-slate-50"
                    >
                      <KeyRound size={16} />
                      Generate Key
                    </button>

                    <button
                      onClick={() => onOpenAnalytics(project)}
                      className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      <BarChart3 size={16} />
                      Analytics
                    </button>

                    <button
                      onClick={() => onOpenAlerts(project)}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:bg-slate-50"
                    >
                      <Bell size={16} />
                      Alerts
                    </button>

                    <button
                      onClick={() => onOpenWebhooks(project)}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:bg-slate-50"
                    >
                      <Webhook size={16} />
                      Webhooks
                    </button>                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit project" : "Create project"}
              </h2>

              <button
                onClick={closeForm}
                aria-label="Close form"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="project-name"
                  className="mb-2 block text-sm font-medium"
                >
                  Project name
                </label>

                <input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  required
                  autoFocus
                  placeholder="My API project"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div>
                <label
                  htmlFor="project-description"
                  className="mb-2 block text-sm font-medium"
                >
                  Description
                </label>

                <textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={10000}
                  rows={4}
                  placeholder="What is this project about?"
                  className="w-full resize-y rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {keyProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {generatedKey ? "API key generated" : "Generate API Key"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {keyProject.name}
                </p>
              </div>

              <button
                onClick={closeKeyModal}
                aria-label="Close API key dialog"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            {!generatedKey ? (
              <form
                onSubmit={handleGenerateKey}
                className="mt-6 space-y-5"
              >
                <div>
                  <label
                    htmlFor="api-key-name"
                    className="mb-2 block text-sm font-medium"
                  >
                    API key name
                  </label>

                  <input
                    id="api-key-name"
                    value={keyName}
                    onChange={(event) => setKeyName(event.target.value)}
                    maxLength={100}
                    required
                    autoFocus
                    placeholder="Production API Key"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />

                  <p className="mt-2 text-xs text-slate-500">
                    Give this key a name that helps you identify its purpose.
                  </p>
                </div>

                {keyError && (
                  <p role="alert" className="text-sm text-red-600">
                    {keyError}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeKeyModal}
                    disabled={generatingKey}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={generatingKey}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    <KeyRound size={16} />
                    {generatingKey ? "Generating..." : "Generate key"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 space-y-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900">
                    Save this API key now!
                  </p>

                  <p className="mt-1 text-sm text-amber-800">
                    This is the only time the complete key will be displayed.
                    You cannot retrieve it again later.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="generated-api-key"
                    className="mb-2 block text-sm font-medium"
                  >
                    Your API key
                  </label>

                  <textarea
                    id="generated-api-key"
                    readOnly
                    value={generatedKey}
                    rows={3}
                    className="w-full resize-none break-all rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm text-slate-800 outline-none"
                  />
                </div>

                {keyError && (
                  <p role="alert" className="text-sm text-red-600">
                    {keyError}
                  </p>
                )}

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied!" : "Copy API key"}
                  </button>

                  <button
                    type="button"
                    onClick={closeKeyModal}
                    className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

