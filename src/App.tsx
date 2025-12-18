import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./contexts/AuthProvider";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import RoleGate from "./components/auth/RoleGate";
import Properties from "./pages/Properties";
import Tenants from "./pages/Tenants";
import Leases from "./pages/Leases";
import Invoices from "./pages/Invoices";
import Payments from "./pages/Payments";
import Maintenance from "./pages/Maintenance";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Pending from "./pages/Pending";
import Users from "./pages/Users";
import InvoiceDetail from "./pages/invoices/InvoiceDetail";
import Owners from "./pages/Owners";
import { ThemeProvider } from "./contexts/ThemeProvider";
import AuthQuerySync from "./components/auth/AuthQuerySync";
import TenantOverdue from "./pages/tenants/TenantOverdue";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CurrencyProvider>
        <AuthProvider>
          <ThemeProvider>
            <Toaster />
            <Sonner />
            <AuthQuerySync />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/properties"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin", "owner"]}>
                        <Properties />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenants"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin"]}>
                        <Tenants />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tenants/:id/overdue"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin"]}>
                        <TenantOverdue />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leases"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin"]}>
                        <Leases />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/invoices"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin", "owner", "tenant"]}>
                        <Invoices />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/invoices/:id"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin", "owner", "tenant"]}>
                        <InvoiceDetail />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/payments"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin", "owner", "tenant"]}>
                        <Payments />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/maintenance"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin", "owner", "tenant"]}>
                        <Maintenance />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/expenses"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin"]}>
                        <Expenses />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin", "owner"]}>
                        <Reports />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin"]}>
                        <Settings />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin"]}>
                        <Users />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/owners"
                  element={
                    <ProtectedRoute>
                      <RoleGate allow={["agency_admin"]}>
                        <Owners />
                      </RoleGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pending"
                  element={
                    <ProtectedRoute>
                      <Pending />
                    </ProtectedRoute>
                  }
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </CurrencyProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;