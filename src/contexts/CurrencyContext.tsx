import React, { createContext, useContext, useMemo, useState } from "react";

export type Currency = "USD" | "DOP";

type CurrencyContextValue = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  defaultCurrency: Currency;
};

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  const defaultCurrency: Currency = "USD";
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);

  const value = useMemo(() => ({ currency, setCurrency, defaultCurrency }), [currency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
};