import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Loader from "@/components/loader";
import AgencyDashboard from "./dashboards/AgencyDashboard";
import OwnerDashboard from "./dashboards/OwnerDashboard";
import TenantDashboard from "./dashboards/TenantDashboard";

const Dashboard = () => {
  const { loading, session, role, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate("/login", { replace: true });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && (!profile || !role)) {
      navigate("/pending", { replace: true });
    }
  }, [loading, session, profile, role, navigate]);

  if (loading || !session) {
    return <Loader />;
  }

  if (!role) {
    return null;
  }

  return (
    <AppShell>
      {role === "agency_admin" && <AgencyDashboard />}
      {role === "owner" && <OwnerDashboard />}
      {role === "tenant" && <TenantDashboard />}
    </AppShell>
  );
};

export default Dashboard;