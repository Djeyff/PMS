import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Loader from "@/components/loader";
import AgencyDashboard from "./dashboards/AgencyDashboard";
import OwnerDashboard from "./dashboards/OwnerDashboard";
import TenantDashboard from "./dashboards/TenantDashboard";

const MASTER_ADMIN_EMAIL = "djeyff06@gmail.com";

const Dashboard = () => {
  const { loading, session, role, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate("/login", { replace: true });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session) {
      const email = (user?.email ?? "").toLowerCase();
      // Avoid redirecting while the session/user object is still stabilizing.
      if (!email) return;

      if (!role && email !== MASTER_ADMIN_EMAIL) {
        navigate("/pending", { replace: true });
      }
    }
  }, [loading, session, role, user?.email, navigate]);

  if (loading || !session) {
    return <Loader />;
  }

  const email = (user?.email ?? "").toLowerCase();

  if (!role && email !== MASTER_ADMIN_EMAIL) {
    return null;
  }

  return (
    <AppShell>
      {role === "agency_admin" && <AgencyDashboard />}
      {role === "owner" && <OwnerDashboard />}
      {role === "tenant" && <TenantDashboard />}
      {/* For the master admin fallback, show admin dashboard even if role hasn't persisted yet */}
      {!role && email === MASTER_ADMIN_EMAIL && <AgencyDashboard />}
    </AppShell>
  );
};

export default Dashboard;