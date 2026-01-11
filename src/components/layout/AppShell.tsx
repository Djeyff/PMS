import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";
import { Home, Building2, Users, FileText, Wrench, Receipt, CreditCard, Settings, LogOut, BarChart3, UserCog, History, Calendar as CalendarIcon, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import type { Role } from "@/contexts/AuthProvider";
import CurrencySelector from "@/components/CurrencySelector";
import MobileNav from "@/components/layout/mobile-nav";
import { useQuery } from "@tanstack/react-query";
import { fetchAgencyById } from "@/services/agencies";

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { role, signOut, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: agency } = useQuery({
    queryKey: ["appshell-agency", profile?.agency_id],
    enabled: !!profile?.agency_id,
    queryFn: () => fetchAgencyById(profile!.agency_id!),
  });
  const brandName = agency?.name ?? "PMS";

  const navItems: { to: string; label: string; icon: any; roles: Role[] }[] = [
    { to: "/dashboard", label: "Dashboard", icon: Home, roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/properties", label: "Properties", icon: Building2, roles: ["agency_admin", "owner"] as Role[] },
    { to: "/owners", label: "Owners", icon: Users, roles: ["agency_admin"] as Role[] },
    { to: "/tenants", label: "Tenants", icon: Users, roles: ["agency_admin"] as Role[] },
    { to: "/leases", label: "Leases", icon: FileText, roles: ["agency_admin"] as Role[] },
    { to: "/invoices", label: "Invoices", icon: Receipt, roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/payments", label: "Payments", icon: CreditCard, roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/maintenance", label: "Maintenance", icon: Wrench, roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/reports", label: "Reports", icon: BarChart3, roles: ["agency_admin", "owner"] as Role[] },
    { to: "/manager-report", label: "Manager Report", icon: UserCog, roles: ["agency_admin"] as Role[] },
    { to: "/owner-reports", label: "Owner Reports", icon: UserCog, roles: ["agency_admin", "owner"] as Role[] },
    { to: "/calendar", label: "Calendar", icon: CalendarIcon, roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/outstanding", label: "Outstanding", icon: History, roles: ["agency_admin"] as Role[] },
    { to: "/logs", label: "Activity Log", icon: History, roles: ["agency_admin"] as Role[] },
    { to: "/users", label: "Users", icon: Users, roles: ["agency_admin"] as Role[] },
    { to: "/security", label: "Security", icon: Shield, roles: ["agency_admin", "owner", "tenant"] as Role[] },
    { to: "/settings", label: "Settings", icon: Settings, roles: ["agency_admin", "owner", "tenant"] as Role[] },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar className="hidden md:flex">
          <SidebarHeader>
            <Link to="/dashboard" className="font-semibold text-lg">{brandName}</Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems
                    .filter((n) => !role || n.roles.includes(role as Role))
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
          <header
            className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-3 md:px-6"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="md:hidden">
              <Link to="/dashboard" className="font-semibold text-lg">{brandName}</Link>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <CurrencySelector />
            </div>
          </header>
          <main
            className="flex-1 p-3 md:p-6 pb-20 md:pb-6"
            style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
          >
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
    </SidebarProvider>
  );
};

export default AppShell;