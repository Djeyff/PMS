import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import Loader from "@/components/loader";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loader />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;