import React, { useEffect, useState } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Login = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (session) {
      navigate("/dashboard", { replace: true });
    }
  }, [session, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Create Account */}
          <div className="space-y-2 mb-6">
            <div className="text-sm font-medium">Create account</div>
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                placeholder="First name"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
              <input
                type="text"
                className="border rounded px-3 py-2 text-sm"
                placeholder="Last name"
                value={last}
                onChange={(e) => setLast(e.target.value)}
              />
              <input
                type="tel"
                className="border rounded px-3 py-2 text-sm"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <input
                type="email"
                className="border rounded px-3 py-2 text-sm"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                className="border rounded px-3 py-2 text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
                disabled={creating}
                onClick={async () => {
                  if (!email || !password || !first || !last) return;
                  setCreating(true);
                  try {
                    const { data, error } = await supabase.auth.signUp({
                      email,
                      password,
                      options: {
                        data: { first_name: first, last_name: last, phone },
                      },
                    });
                    if (error) {
                      alert(error.message);
                    } else {
                      alert("Check your email to confirm your account.");
                      setFirst(""); setLast(""); setPhone(""); setEmail(""); setPassword("");
                    }
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                {creating ? "Creating..." : "Create account"}
              </button>
            </div>
          </div>
          <Auth
            supabaseClient={supabase}
            providers={[]}
            showLinks={true}
            appearance={{ theme: ThemeSupa }}
            localization={{ variables: { sign_in: { email_label: "Email" } } }}
            theme="light"
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;