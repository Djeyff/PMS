export type Currency = "USD" | "DOP";

export const getRateUSDToDOP = async (): Promise<number> => {
  // Free API source: exchangerate.host
  const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=DOP");
  if (!res.ok) throw new Error("Failed to fetch USD->DOP rate");
  const data = await res.json();
  const rate = data?.rates?.DOP;
  if (!rate || typeof rate !== "number") throw new Error("Invalid rate response");
  return rate;
};

export const convert = async (amount: number, from: Currency, to: Currency): Promise<number> => {
  if (from === to) return amount;
  const rate = await getRateUSDToDOP();
  if (from === "USD" && to === "DOP") return amount * rate;
  if (from === "DOP" && to === "USD") return amount / rate;
  return amount;
};