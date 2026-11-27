
import { lazy, Suspense, useEffect, useState } from "react";
import api from "./services/api";

const AuthPage = lazy(() => import("./pages/AuthPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const AlertsPage = lazy(() => import("./pages/AlertsPage"));
const WebhooksPage = lazy(() => import("./pages/WebhooksPage"));

function PageLoader() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <p className="mt-4 text-sm text-slate-500">
          Loading KeyFlux...
        </p>
      </div>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeProject, setActiveProject] = useState(null);
  const [activePage, setActivePage] = useState("projects");

  // Initialize the current KeyFlux browser-history entry.
  useEffect(() => {
    if (checkingSession) return;

    window.history.replaceState(
      {
        keyflux: true,
        page: user ? "projects" : "auth",
        project: null
      },
      "",
      window.location.href
    );
  }, [checkingSession]);

  // Restore the correct page when browser Back or Forward is used.
  useEffect(() => {
    function handlePopState(event) {
      const token = localStorage.getItem("keyflux_token");

      if (!token) {
        setUser(null);
        setActiveProject(null);
        setActivePage("projects");

        window.history.replaceState(
          {
            keyflux: true,
            page: "auth",
            project: null
          },
          "",
          window.location.href
        );

        return;
      }

      const historyState = event.state;

      if (historyState?.keyflux) {
        setActivePage(
          historyState.page === "analytics" ||
          historyState.page === "alerts" ||
          historyState.page === "webhooks"
            ? historyState.page
            : "projects"
        );

        setActiveProject(historyState.project || null);
      } else {
        setActivePage("projects");
        setActiveProject(null);

        window.history.replaceState(
          {
            keyflux: true,
            page: "projects",
            project: null
          },
          "",
          window.location.href
        );
      }
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const token = localStorage.getItem("keyflux_token");

      if (!token) {
        if (active) setCheckingSession(false);
        return;
      }

      try {
        const response = await api.get("/auth/me");

        if (active) {
          setUser(response.data.data.user);
        }
      } catch {
        localStorage.removeItem("keyflux_token");

        if (active) {
          setUser(null);
        }
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, []);

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setActiveProject(null);
    setActivePage("projects");

    window.history.replaceState(
      {
        keyflux: true,
        page: "projects",
        project: null
      },
      "",
      window.location.href
    );
  }

  function handleLogout() {
    localStorage.removeItem("keyflux_token");

    setUser(null);
    setActiveProject(null);
    setActivePage("projects");

    window.history.replaceState(
      {
        keyflux: true,
        page: "auth",
        project: null
      },
      "",
      window.location.href
    );
  }

  function navigateToProjectPage(project, page) {
    window.history.pushState(
      {
        keyflux: true,
        page,
        project
      },
      "",
      window.location.href
    );

    setActiveProject(project);
    setActivePage(page);
  }

  function handleOpenAnalytics(project) {
    navigateToProjectPage(project, "analytics");
  }

  function handleOpenAlerts(project) {
    navigateToProjectPage(project, "alerts");
  }

  function handleOpenWebhooks(project) {
    navigateToProjectPage(project, "webhooks");
  }

  function handleBackToProjects() {
    if (
      window.history.state?.keyflux &&
      window.history.state.page !== "projects"
    ) {
      window.history.back();
      return;
    }

    setActiveProject(null);
    setActivePage("projects");

    window.history.replaceState(
      {
        keyflux: true,
        page: "projects",
        project: null
      },
      "",
      window.location.href
    );
  }

  if (checkingSession) {
    return <PageLoader />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      {!user ? (
        <AuthPage onLogin={handleLogin} />
      ) : activePage === "analytics" && activeProject ? (
        <AnalyticsPage
          project={activeProject}
          user={user}
          onBack={handleBackToProjects}
          onLogout={handleLogout}
        />
      ) : activePage === "alerts" && activeProject ? (
        <AlertsPage
          project={activeProject}
          user={user}
          onBack={handleBackToProjects}
          onLogout={handleLogout}
        />
      ) : activePage === "webhooks" && activeProject ? (
        <WebhooksPage
          project={activeProject}
          user={user}
          onBack={handleBackToProjects}
          onLogout={handleLogout}
        />
      ) : (
        <ProjectsPage
          user={user}
          onLogout={handleLogout}
          onOpenAnalytics={handleOpenAnalytics}
          onOpenAlerts={handleOpenAlerts}
          onOpenWebhooks={handleOpenWebhooks}
        />
      )}
    </Suspense>
  );
}


