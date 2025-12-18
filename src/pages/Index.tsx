import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import Loader from "@/components/loader";
import FileUploader from "@/components/FileUploader";

const Index = () => {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (session) navigate("/dashboard", { replace: true });
      else navigate("/login", { replace: true });
    }
  }, [loading, session, navigate]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="max-w-xl">
        <FileUploader />
      </div>
    </div>
  );
};

export default Index;