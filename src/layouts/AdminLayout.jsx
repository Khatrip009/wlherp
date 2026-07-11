import { useState, useCallback } from "react";
import { Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile overlay
  const [collapsed, setCollapsed] = useState(false);     // desktop icon mode

  // Memoize callbacks so Sidebar won't re-render unnecessarily
  const closeMobile = useCallback(() => setSidebarOpen(false), []);
  const toggleCollapsed = useCallback(() => setCollapsed(prev => !prev), []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar wrapper */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-all duration-300
          ${collapsed ? 'w-16' : 'w-72'}
          lg:relative lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <Sidebar
          onClose={closeMobile}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-6 bg-secondary-bg">
          {children}
        </main>
      </div>
    </div>
  );
}