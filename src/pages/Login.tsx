import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Mode = "signin" | "signup";

const Login = () => {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("signin");

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign up only fields
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");

  const [signingIn, setSigningIn] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (session) {
      navigate("/dashboard", { replace: true });
    }
  }, [session, navigate]);

  const handleSignIn = async () => {
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Signed in");
      navigate("/dashboard", { replace: true });
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignUp = async () => {
    if (!first || !last || !email || !password) {
      toast.error("Please complete all required fields");
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: first, last_name: last, phone },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Account created. Check your email to confirm.");
      setMode("signin");
      setPassword("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "signin" ? "Sign in" : "Create account"}</CardTitle>
        </CardHeader>
        <CardContent>
          {mode === "signin" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm">Email address</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={signingIn}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Password</label>
                <Input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={signingIn}
                />
              </div>
              <Button className="w-full" onClick={handleSignIn} disabled={signingIn}>
                {signingIn ? "Signing in..." : "Sign in"}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Don’t have an account?{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => setMode("signup")}
                >
                  Create one
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <label className="text-sm">First name</label>
                  <Input
                    type="text"
                    placeholder="First name"
                    value={first}
                    onChange={(e) => setFirst(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">Last name</label>
                  <Input
                    type="text"
                    placeholder="Last name"
                    value={last}
                    onChange={(e) => setLast(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">Phone (optional)</label>
                  <Input
                    type="tel"
                    placeholder="+1 555 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">Email</label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">Password</label>
                  <Input
                    type="password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={creating}
                  />
                </div>
              </div>
              <Button className="w-full" onClick={handleSignUp} disabled={creating}>
                {creating ? "Creating..." : "Create account"}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;