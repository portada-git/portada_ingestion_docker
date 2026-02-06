/**
 * Main App component with routing and layout
 * Modern React implementation with proper error boundaries and authentication
 */

import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/useStore";
import { useSession } from "./hooks/useSession";
import Layout from "./components/Layout";
import LoginView from "./views/LoginView";
import DashboardView from "./views/DashboardView";
import IngestionView from "./views/IngestionView";
import AnalysisView from "./views/AnalysisView";
import ConfigurationView from "./views/ConfigurationView";
import ProcessDashboardView from "./views/ProcessDashboardView";
import { DailyIngestionSummaryView } from "./views/DailyIngestionSummaryView";
import ProtectedRoute from "./components/ProtectedRoute";
import NotificationContainer from "./components/NotificationContainer";
import ErrorBoundary from "./components/ErrorBoundary";

// Initialize i18n
import "./i18n";
import "./styles/upload.css";

// Protected Route component
const ProtectedRouteWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <ProtectedRoute>{children}</ProtectedRoute>;
};

const App: React.FC = () => {
  const { isAuthenticated, logout } = useAuthStore();
  const { i18n } = useTranslation();

  // Initialize session management for authenticated users with longer intervals
  useSession({
    refreshThreshold: 10, // Refresh 10 minutes before expiry
    warningThreshold: 5, // Show warning 5 minutes before expiry
    checkInterval: 10, // Check every 10 minutes instead of 1
  });

  // Initialize authentication state from localStorage only once
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token && !isAuthenticated) {
      // Token exists but user is not authenticated, validate token
      console.log("Token found in localStorage");
      // Don't make API call here, let the session hook handle it
    }
  }, []); // Remove isAuthenticated dependency to prevent re-runs

  // Global authentication error handler
  useEffect(() => {
    const handleAuthError = (event: CustomEvent) => {
      console.warn("[App] Authentication error detected:", event.detail);

      // Only logout if currently authenticated
      if (isAuthenticated) {
        logout();
      }
    };

    window.addEventListener("auth-error", handleAuthError as EventListener);

    return () => {
      window.removeEventListener(
        "auth-error",
        handleAuthError as EventListener,
      );
    };
  }, [logout, isAuthenticated]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route
            path="/unauthorized"
            element={
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
                  <h1 className="text-xl font-semibold text-gray-900 mb-2">
                    Unauthorized Access
                  </h1>
                  <p className="text-gray-600 mb-4">
                    You do not have permission to access this page.
                  </p>
                  <button
                    onClick={() => (window.location.href = "/login")}
                    className="btn btn-primary"
                  >
                    Login
                  </button>
                </div>
              </div>
            }
          />
          <Route
            path="/*"
            element={
              <ProtectedRouteWrapper>
                <Layout key={i18n.language}>
                  <Routes>
                    <Route
                      path="/"
                      element={<Navigate to="/dashboard" replace />}
                    />
                    <Route path="/dashboard" element={<DashboardView />} />
                    <Route path="/ingestion" element={<IngestionView />} />
                    <Route path="/analysis/*" element={<AnalysisView />} />
                    <Route
                      path="/configuration/*"
                      element={<ConfigurationView />}
                    />
                    <Route
                      path="/processes"
                      element={<ProcessDashboardView />}
                    />
                    <Route
                      path="/daily-ingestion-summary"
                      element={<DailyIngestionSummaryView />}
                    />
                    <Route
                      path="*"
                      element={<Navigate to="/dashboard" replace />}
                    />
                  </Routes>
                </Layout>
              </ProtectedRouteWrapper>
            }
          />
        </Routes>

        {/* Global notification container */}
        <NotificationContainer />
      </div>
    </ErrorBoundary>
  );
};

export default App;
