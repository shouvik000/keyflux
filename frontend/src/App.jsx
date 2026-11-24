import { useEffect, useState } from "react";
import AuthPage from "./pages/AuthPage";
import ProjectsPage from "./pages/ProjectsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import api from "./services/api";

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeProject, setActiveProject] = useState(null);
  const [activePage, setActivePage] = useState("projects");

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

  function handleLogout() {
    localStorage.removeItem("keyflux_token");
    setUser(null);
    setActiveProject(null);
    setActivePage("projects");
  }

  function handleOpenAnalytics(project) {
    setActiveProject(project);
    setActivePage("analytics");
  }

  function handleBackToProjects() {
    setActiveProject(null);
    setActivePage("projects");
  }

  if (checkingSession) {
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

  if (!user) {
    return <AuthPage onLogin={setUser} />;
  }

  if (activePage === "analytics" && activeProject) {
    return (
      <AnalyticsPage
        project={activeProject}
        user={user}
        onBack={handleBackToProjects}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <ProjectsPage
      user={user}
      onLogout={handleLogout}
      onOpenAnalytics={handleOpenAnalytics}
    />
  );
}
