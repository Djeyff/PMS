import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import Loader from "@/components/loader";

const Index = () => {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (session) navigate("/dashboard", { replace: true });
      else navigate("/login", { replace: true });
    }
  }, [loading, session, navigate]);

  return <Loader />;
};

export default Index;