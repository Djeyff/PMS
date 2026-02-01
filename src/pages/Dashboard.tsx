import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Loader from "@/components/loader";
import AgencyDashboard from "./dashboards/AgencyDashboard";
import OwnerDashboard from "./dashboards/OwnerDashboard";
import TenantDashboard from "./dashboards/TenantDashboard";

const MASTER_ADMIN_EMAILS = new Set(["djeyff06@gmail.com", "jeffrey.hubert.01@gmail.com"]);

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
      if (!role && !MASTER_ADMIN_EMAILS.has(email)) {
        navigate("/pending", { replace: true });
      }
    }
  }, [loading, session, role, user, navigate]);

  if (loading || !session) {
    return <Loader />;
  }

  const email = (user?.email ?? "").toLowerCase();
  const isMasterAdmin = MASTER_ADMIN_EMAILS.has(email);

  if (!role && !isMasterAdmin) {
    return null;
  }

  return (
    <AppShell>
      {role === "agency_admin" && <AgencyDashboard />}
      {role === "owner" && <OwnerDashboard />}
      {role === "tenant" && <TenantDashboard />}
      {!role && isMasterAdmin && <AgencyDashboard />}
    </AppShell>
  );
};

export default Dashboard;