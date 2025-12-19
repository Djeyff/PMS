"use client";

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Building2, Users, FileText, Wrench, Receipt, CreditCard, Settings, BarChart3, History } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<"agency_admin" | "owner" | "tenant">;
};

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: Home, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/invoices", label: "Invoices", icon: Receipt, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/payments", label: "Payments", icon: CreditCard, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/properties", label: "Properties", icon: Building2, roles: ["agency_admin", "owner"] },
  { to: "/maintenance", label: "Maintenance", icon: Wrench, roles: ["agency_admin", "owner", "tenant"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["agency_admin", "owner"] },
  { to: "/outstanding", label: "Outstanding", icon: History, roles: ["agency_admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["agency_admin"] },
];

const MobileNav = () => {
  const { role } = useAuth();
  const location = useLocation();

  const items = navItems.filter((n) => !role || n.roles.includes(role as any)).slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto max-w-5xl">
        <ul className="grid grid-cols-5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`flex flex-col items-center justify-center py-2 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}
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