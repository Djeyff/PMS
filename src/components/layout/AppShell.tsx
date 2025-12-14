import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Home, Building2, Users, FileText, Wrench, Receipt, CreditCard, Settings, LogOut, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import CurrencySelector from "@/components/CurrencySelector";

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: Home, roles: ["agency_admin", "owner", "tenant"] },
    { to: "/properties", label: "Properties", icon: Building2, roles: ["agency_admin", "owner"] },
    { to: "/tenants", label: "Tenants", icon: Users, roles: ["agency_admin"] },
    { to: "/leases", label: "Leases", icon: FileText, roles: ["agency_admin"] },
    { to: "/invoices", label: "Invoices", icon: Receipt, roles: ["agency_admin", "owner", "tenant"] },
    { to: "/payments", label: "Payments", icon: CreditCard, roles: ["agency_admin", "owner", "tenant"] },
    { to: "/maintenance", label: "Maintenance", icon: Wrench, roles: ["agency_admin", "owner", "tenant"] },
    { to: "/reports", label: "Reports", icon: BarChart3, roles: ["agency_admin", "owner"] },
    { to: "/settings", label: "Settings", icon: Settings, roles: ["agency_admin"] },
  ] as const;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar className="hidden md:flex">
        <SidebarHeader>
          <Link to="/dashboard" className="font-semibold text-lg">PMS</Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems
                  .filter((n) => !role || (n.roles as string[]).includes(role))
                  .map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={location.pathname.startsWith(item.to)}>
                        <Link to={item.to} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Button variant="ghost" className="w-full justify-start gap-2" onClick={async () => { await signOut(); navigate("/login"); }}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </SidebarFooter>
      </Sidebar>
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b flex items-center justify-between px-3 md:px-6">
          <div className="md:hidden">
            <Link to="/dashboard" className="font-semibold text-lg">PMS</Link>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <CurrencySelector />
          </div>
        </header>
        <main className="flex-1 p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;