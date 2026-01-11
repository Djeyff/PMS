"use client";

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Building2, Users, FileText, Wrench, Receipt, CreditCard, Settings, BarChart3, History, UserCog } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<"agency_admin" | "owner" | "tenant">;
};

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: Home, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/properties", label: "Properties", icon: Building2, roles: ["agency_admin", "owner"] },
  { to: "/owners", label: "Owners", icon: Users, roles: ["agency_admin"] },
  { to: "/tenants", label: "Tenants", icon: Users, roles: ["agency_admin"] },
  { to: "/leases", label: "Leases", icon: FileText, roles: ["agency_admin"] },
  { to: "/invoices", label: "Invoices", icon: Receipt, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/payments", label: "Payments", icon: CreditCard, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/maintenance", label: "Maintenance", icon: Wrench, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["agency_admin", "owner"] },
  { to: "/manager-report", label: "Manager Report", icon: UserCog, roles: ["agency_admin"] },
  { to: "/owner-reports", label: "Owner Reports", icon: UserCog, roles: ["agency_admin", "owner"] },
  { to: "/contracts", label: "Contracts", icon: FileText, roles: ["agency_admin"] },
  { to: "/outstanding", label: "Outstanding", icon: History, roles: ["agency_admin"] },
  { to: "/logs", label: "Activity Log", icon: History, roles: ["agency_admin"] },
  { to: "/users", label: "Users", icon: Users, roles: ["agency_admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["agency_admin", "owner", "tenant"] },
];

const MobileNav = () => {
  const { role } = useAuth();
  const location = useLocation();

  const items = navItems.filter((n) => !role || n.roles.includes(role as any));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background md:hidden shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Bottom navigation"
    >
      <div className="mx-auto max-w-5xl">
        <ul
          className="flex items-stretch gap-2 px-2 py-1 overflow-x-auto snap-x snap-mandatory"
          // Enable smooth touch scrolling on mobile Safari
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <li key={item.to} className="snap-start flex-shrink-0">
                <Link
                  to={item.to}
                  className={`flex min-w-[90px] flex-col items-center justify-center py-2 text-xs ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="mt-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};

export default MobileNav;