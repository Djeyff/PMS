import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import type { Role } from "@/contexts/AuthProvider";

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { role, signOut, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = React.useState(false);

  const displayName =
    profile?.first_name?.trim() ||
    (role === "agency_admin" ? "Admin" : role === "owner" ? "Owner" : role === "tenant" ? "Tenant" : "—");

  const navItems: { to: string; label: string; icon: string; roles: Role[] }[] = [
    { to: "/dashboard", label: "Dashboard", icon: "📊", roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/properties", label: "Properties", icon: "🏠", roles: ["agency_admin", "owner"] as Role[] },
    { to: "/tenants", label: "Tenants", icon: "👥", roles: ["agency_admin"] as Role[] },
    { to: "/leases", label: "Leases", icon: "📋", roles: ["agency_admin"] as Role[] },
    { to: "/invoices", label: "Invoices", icon: "📄", roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/outstanding", label: "Outstanding", icon: "💹", roles: ["agency_admin"] as Role[] },
    { to: "/payments", label: "Payments", icon: "💰", roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/calendar", label: "Calendar", icon: "📅", roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/reports", label: "Reports", icon: "📈", roles: ["agency_admin", "owner"] as Role[] },
    { to: "/manager-report", label: "Manager Report", icon: "💼", roles: ["agency_admin"] as Role[] },
    { to: "/owner-reports", label: "Owner Reports", icon: "👤", roles: ["agency_admin", "owner"] as Role[] },
    { to: "/activity", label: "Activity Log", icon: "🔍", roles: ["agency_admin"] as Role[] },
  ];

  const visibleItems = navItems.filter((item) => !role || item.roles.includes(role as Role));
  const isActive = (to: string) => {
    if (to === "/dashboard") return location.pathname === "/" || location.pathname === "/dashboard";
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const logout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#0f1a2e] text-white">
      <aside
        className="fixed bottom-0 left-0 top-0 z-40 hidden w-56 flex-col border-r border-white/10 lg:flex"
        style={{ background: "linear-gradient(180deg, #0c1525, #0f1a2e)" }}
      >
        <Link to="/dashboard" className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold"
            style={{ background: "linear-gradient(135deg, #63b3ed, #4299e1)", color: "#0f1a2e" }}
          >
            🏢
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight text-white">PMS OS</h1>
            <p className="text-[10px] leading-tight text-[#63b3ed]">Property Management</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                isActive(item.to)
                  ? "bg-blue-500/20 font-medium text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-5 text-center text-sm">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center justify-between">
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                role === "agency_admin" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {displayName}
            </span>
            <button onClick={logout} className="text-xs text-white/30 transition-colors hover:text-red-400">
              Logout
            </button>
          </div>
        </div>
      </aside>

      <header
        className="sticky top-0 z-50 border-b border-white/10 lg:hidden"
        style={{ background: "linear-gradient(135deg, #0f1a2e, #1a2744)", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between px-3 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
              style={{ background: "linear-gradient(135deg, #63b3ed, #4299e1)", color: "#0f1a2e" }}
            >
              🏢
            </div>
            <span className="text-sm font-bold text-white">PMS OS</span>
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                role === "agency_admin" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {displayName}
            </span>
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-lg p-2 text-lg text-white/70 hover:bg-white/10"
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <nav className="max-h-[70vh] space-y-0.5 overflow-y-auto border-t border-white/10 px-3 pb-3 pt-1">
            {visibleItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                  isActive(item.to) ? "bg-blue-500/20 font-medium text-white" : "text-white/50"
                }`}
              >
                <span className="w-5 text-center text-sm">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
            >
              <span className="w-5 text-center">🚪</span>
              Logout
            </button>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:ml-56">{children}</main>
    </div>
  );
};

export default AppShell;
