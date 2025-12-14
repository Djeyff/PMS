export type Currency = "USD" | "DOP";

const FALLBACK_USD_TO_DOP = 58; // Safe fallback if API is unavailable

export const getRateUSDToDOP = async (): Promise<number> => {
  const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=DOP", { cache: "no-store" });
  if (!res.ok) {
    console.warn("USD->DOP rate fetch failed, using fallback:", res.status);
  } else {
    const data = await res.json();
    // Prefer latest endpoint shape: data.rates.DOP
    const rateFromRates = data?.rates?.DOP;
    // Also support convert endpoint shape if backend changes: data.result
    const rateFromResult = data?.result;

    const rate = typeof rateFromRates === "number" ? rateFromRates
      : typeof rateFromResult === "number" ? rateFromResult
      : null;

    if (typeof rate === "number" && isFinite(rate) && rate > 0) {
      return rate;
    } else {
      console.warn("USD->DOP Invalid rate response shape, using fallback.");
    }
  }
  return FALLBACK_USD_TO_DOP;
};

export const convert = async (amount: number, from: Currency, to: Currency): Promise<number> => {
  if (from === to) return amount;
  const rate = await getRateUSDToDOP();
  if (from === "USD" && to === "DOP") return amount * rate;
  if (from === "DOP" && to === "USD") return amount / rate;
  return amount;
};