import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useLocation, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-[#0f1a2e] text-white">
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-[300px] rounded-2xl border border-white/10 bg-[#121b2c]/75 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <div className="mb-4 text-center">
            <div className="text-xl font-semibold tracking-wide">🏢 PMS OS</div>
            <div className="text-xs text-white/55">Property Management System</div>
            <div className="mt-4 text-xs text-white/45">Select account</div>
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
                  className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                    active
                      ? account.id === "jeff"
                        ? "border-white/20 bg-gradient-to-r from-emerald-700/70 to-emerald-600/50 text-white"
                        : "border-white/20 bg-gradient-to-r from-slate-700/80 to-indigo-700/50 text-white"
                      : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-semibold">{account.label}</div>
                  <div className="text-[11px] text-white/60">{account.subtitle}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
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
              className="h-10 border-white/10 bg-[#0f1626] text-center font-mono text-sm tracking-[0.35em] text-white outline-none placeholder:text-white/20"
            />
          </div>

          {error ? <p className="mt-2 text-center text-xs text-red-300">{error}</p> : null}
          {missingConfig.length > 0 ? (
            <p className="mt-2 text-center text-[11px] text-amber-200/80">
              Missing: {missingConfig.join(", ")}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-lg bg-[#27445e] py-2 text-sm font-medium text-white hover:bg-[#31506b]"
            >
              {submitting ? "Logging in..." : "Login"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="w-full rounded-lg border-white/10 bg-white/5 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              Reset
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
