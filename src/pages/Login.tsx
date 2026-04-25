import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2, KeyRound, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearPmsSession,
  getPmsAuthEmail,
  getPmsCodeLength,
  missingPmsCodeConfig,
  normalizePmsCode,
  PMS_ACCOUNTS,
  savePmsSession,
  verifyPmsCode,
  type PmsAccountId,
} from "@/lib/pms-access";

const accountOrder: PmsAccountId[] = ["jeff", "gael"];

const Login = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<PmsAccountId | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const codeLength = getPmsCodeLength();
  const missingConfig = useMemo(() => missingPmsCodeConfig(), []);
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTo]);

  useEffect(() => {
    if (selected) inputRef.current?.focus();
  }, [selected]);

  const chooseAccount = (account: PmsAccountId) => {
    setSelected(account);
    setError("");
    setCode("");
  };

  const handleSubmit = async () => {
    if (!selected) {
      setError("Select Gael or Jeff first.");
      return;
    }

    if (!verifyPmsCode(selected, code)) {
      setError(`Invalid ${codeLength}-digit code.`);
      return;
    }

    setSubmitting(true);
    try {
      const normalizedCode = normalizePmsCode(code);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: getPmsAuthEmail(selected),
        password: normalizedCode,
      });

      if (signInError) {
        savePmsSession({ account: selected, at: Date.now() });
      } else {
        clearPmsSession();
      }

      toast.success(`Signed in as ${PMS_ACCOUNTS[selected].label}`);
      navigate(redirectTo, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    clearPmsSession();
    setSelected(null);
    setCode("");
    setError("");
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-[#0d1624] text-white">
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-[340px] border-white/10 bg-[#121d2f]/90 text-white shadow-2xl shadow-black/30">
          <CardContent className="p-5">
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-white/10">
                <Building2 className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-semibold">PMS Web</h1>
              <p className="text-xs text-white/55">Property Management System</p>
            </div>

            <div className="space-y-2">
              {accountOrder.map((accountId) => {
                const account = PMS_ACCOUNTS[accountId];
                const active = selected === accountId;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => chooseAccount(account.id)}
                    className={`w-full rounded-md border px-4 py-3 text-left transition ${
                      active
                        ? "border-emerald-300/50 bg-emerald-500/20 text-white"
                        : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-sm font-semibold">{account.label}</div>
                    <div className="text-xs text-white/55">{account.subtitle}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <Input
                ref={inputRef}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, codeLength));
                  setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSubmit();
                }}
                disabled={submitting}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="0000"
                className="h-11 border-white/10 bg-[#0b1220] text-center font-mono text-base tracking-[0.55em] text-white placeholder:text-white/20"
              />
            </div>

            {error ? <p className="mt-2 text-center text-xs text-red-300">{error}</p> : null}
            {missingConfig.length > 0 ? (
              <p className="mt-2 text-center text-[11px] text-amber-200/80">
                Missing: {missingConfig.join(", ")}
              </p>
            ) : null}

            <div className="mt-4 space-y-2">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-[#27445e] text-white hover:bg-[#31506b]"
              >
                <KeyRound className="h-4 w-4" />
                {submitting ? "Logging in..." : "Login"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Login;
