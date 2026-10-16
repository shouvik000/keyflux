import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Code2,
  ShieldCheck
} from "lucide-react";

const API_HEALTH_URL = "/api/health";

export default function App() {
  const [backendStatus, setBackendStatus] = useState("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch(API_HEALTH_URL, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Backend health check failed");
        }

        const data = await response.json();

        if (data.success === true) {
          setBackendStatus("online");
        } else {
          setBackendStatus("offline");
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setBackendStatus("offline");
        }
      }
    }

    checkBackend();

    return () => controller.abort();
  }, []);

  const statusContent = {
    checking: {
      label: "Checking backend",
      className: "bg-amber-50 text-amber-800"
    },
    online: {
      label: "Backend connected",
      className: "bg-emerald-50 text-emerald-800"
    },
    offline: {
      label: "Backend unavailable",
      className: "bg-red-50 text-red-800"
    }
  }[backendStatus];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a
            href="/"
            className="flex items-center gap-3"
            aria-label="KeyFlux home"
          >
            <img
              src="/favicon.svg"
              alt=""
              className="h-9 w-9"
            />

            <span className="text-lg font-semibold tracking-tight">
              keyflux
            </span>
          </a>

          <span className="text-sm text-slate-500">
            API Management Platform
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
            <Activity size={15} />
            Developer infrastructure
          </div>

          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Control every
            <br />
            API call.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Manage API keys, control request limits, and understand
            API usage from one developer-focused platform.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#system-status"
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Check system status
              <ArrowUpRight size={16} />
            </a>

            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Code2 size={16} />
              GitHub
            </a>
          </div>
        </div>

        <div
          id="system-status"
          className="mt-16 grid gap-4 border-t border-slate-200 pt-8 sm:grid-cols-3"
        >
          <StatusCard
            icon={<Activity size={19} />}
            title="Frontend"
            description="React application loaded successfully."
            status="Operational"
            positive
          />

          <StatusCard
            icon={<ShieldCheck size={19} />}
            title="Backend API"
            description="Live health check from the Express server."
            status={statusContent.label}
            className={statusContent.className}
            positive={backendStatus === "online"}
          />

          <StatusCard
            icon={<Code2 size={19} />}
            title="API version"
            description="Versioned public endpoints will be added in a later milestone."
            status="In development"
          />
        </div>

        <footer className="mt-20 border-t border-slate-200 pt-6 text-sm text-slate-500">
          KeyFlux · Control every API call.
        </footer>
      </section>
    </main>
  );
}

function StatusCard({
  icon,
  title,
  description,
  status,
  positive = false,
  className = "bg-slate-100 text-slate-700"
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-slate-700">
        {icon}
        <h2 className="font-medium">{title}</h2>
      </div>

      <p className="mt-3 min-h-12 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <div
        className={`mt-4 inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium ${className}`}
      >
        {positive ? (
          <CheckCircle2 size={14} />
        ) : title === "Backend API" && status === "Backend unavailable" ? (
          <CircleAlert size={14} />
        ) : null}

        {status}
      </div>
    </article>
  );
}
