import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import Loader from "@/components/loader";
import FileUploader from "@/components/FileUploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

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
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Property Manager Report</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Monthly owner breakdown, manager fee and suggested exchange rate.
            </div>
            <Button asChild>
              <Link to="/manager-report">Open</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;