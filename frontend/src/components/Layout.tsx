/**
 * Main layout component with sidebar navigation
 * Implements responsive design and accessibility features
 */

import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Upload,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useUIStore } from "../store/useStore";
import { useUploadStore } from "../store/useUploadStore";
import MobileMenu from "./MobileMenu";
import LanguageSelector from "./LanguageSelector";
import clsx from "clsx";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { sidebarOpen, setSidebarOpen, expandedMenus, toggleMenuExpansion } =
    useUIStore();
  const { getStats } = useUploadStore();
  const location = useLocation();

  const uploadStats = getStats();

  // Close mobile menu on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, setSidebarOpen]);

  // Handle escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [sidebarOpen, setSidebarOpen]);

  const navigation = [
    { name: t("navigation.dashboard"), href: "/dashboard", icon: Home },
    { name: t("navigation.ingestion"), href: "/ingestion", icon: Upload },
    {
      name: t("navigation.processes"),
      href: "/processes",
      icon: Activity,
      badge: uploadStats.activeTasks > 0 ? uploadStats.activeTasks : undefined,
    },
    {
      name: t("navigation.analysis"),
      href: "/analysis",
      icon: BarChart3,
      children: [
        { name: t("navigation.missingDates"), href: "/analysis/missing-dates" },
        { name: t("navigation.duplicates"), href: "/analysis/duplicates" },
        { name: t("navigation.dailyEntries"), href: "/analysis/daily-entries" },
        {
          name: t("navigation.knownEntities"),
          href: "/analysis/known-entities",
        },
      ],
    },
    {
      name: t("navigation.configuration"),
      href: "/configuration",
      icon: Settings,
      children: [
        {
          name: t("navigation.storageMetadata"),
          href: "/configuration/storage-metadata",
        },
        {
          name: t("navigation.processMetadata"),
          href: "/configuration/process-metadata",
        },
      ],
    },
  ];

  const handleLogout = async () => {
    await logout();
  };

  const handleMenuToggle = (menuName: string) => {
    toggleMenuExpansion(menuName);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <div
        className={clsx(
          "hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white shadow-lg",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <img
                  src="/logo.png"
                  alt="PortAda Logo"
                  className="w-10 h-10 object-contain"
                  role="img"
                  aria-label={t("navigation.logoAlt")}
                />
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold text-gray-900">
                  {t("app.title")}
                </h1>
                <p className="text-xs text-gray-500">{t("app.subtitle")}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav
            className="flex-1 px-4 py-4 space-y-2 overflow-y-auto"
            role="navigation"
            aria-label={t("navigation.mainNavigation")}
          >
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              const isExpanded = expandedMenus.includes(item.name);
              const hasChildren = item.children && item.children.length > 0;

              return (
                <div key={item.name}>
                  {hasChildren ? (
                    <button
                      onClick={() => handleMenuToggle(item.name)}
                      className={clsx(
                        "sidebar-item w-full text-left",
                        isActive
                          ? "sidebar-item-active"
                          : "sidebar-item-inactive",
                      )}
                      aria-expanded={isExpanded}
                      aria-controls={`submenu-${item.name}`}
                    >
                      <item.icon className="w-5 h-5 mr-3" aria-hidden="true" />
                      <span className="flex-1">{item.name}</span>
                      {isExpanded ? (
                        <ChevronDown
                          className="w-4 h-4 ml-2"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronRight
                          className="w-4 h-4 ml-2"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ) : (
                    <Link
                      to={item.href}
                      className={clsx(
                        "sidebar-item",
                        isActive
                          ? "sidebar-item-active"
                          : "sidebar-item-inactive",
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <item.icon className="w-5 h-5 mr-3" aria-hidden="true" />
                      <span className="flex-1">{item.name}</span>
                      {item.badge && (
                        <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Sub-navigation */}
                  {hasChildren && isExpanded && (
                    <div
                      id={`submenu-${item.name}`}
                      className="ml-8 mt-2 space-y-1"
                      role="menu"
                      aria-label={t("navigation.submenu", { name: item.name })}
                    >
                      {item.children.map((child) => {
                        const childIsActive =
                          location.pathname === child.href.split("?")[0] ||
                          (child.href.includes("?") &&
                            location.search.includes(child.href.split("?")[1]));

                        return (
                          <Link
                            key={child.name}
                            to={child.href}
                            className={clsx(
                              "block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                              childIsActive && "text-blue-700 bg-blue-50",
                            )}
                            role="menuitem"
                            aria-current={childIsActive ? "page" : undefined}
                          >
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User info, language selector and logout */}
          <div className="border-t border-gray-200 p-4 space-y-3">
            {/* Language Selector */}
            <div className="flex justify-center">
              <LanguageSelector />
            </div>

            <div className="flex items-center mb-3">
              <div className="flex-shrink-0">
                <div
                  className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center"
                  role="img"
                  aria-label={t("navigation.userAvatar", {
                    name: user?.full_name || user?.username,
                  })}
                >
                  <span className="text-sm font-medium text-gray-700">
                    {user?.full_name?.charAt(0) ||
                      user?.username?.charAt(0) ||
                      "U"}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={t("navigation.logout")}
            >
              <LogOut className="w-4 h-4 mr-3" aria-hidden="true" />
              {t("navigation.logout")}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        {/* Mobile top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={t("navigation.openMenu")}
            >
              <Menu className="w-6 h-6" aria-hidden="true" />
            </button>
            <div className="flex items-center">
              <img
                src="/logo.png"
                alt="PortAda Logo"
                className="w-8 h-8 object-contain mr-2"
                role="img"
                aria-label={t("navigation.logoAlt")}
              />
              <h1 className="text-lg font-semibold text-gray-900">
                {t("app.title")}
              </h1>
            </div>
            <div className="w-10" /> {/* Spacer */}
          </div>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto"
          role="main"
          aria-label={t("navigation.mainContent")}
        >
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      {/* Mobile Menu */}
      <MobileMenu isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
};

export default Layout;
