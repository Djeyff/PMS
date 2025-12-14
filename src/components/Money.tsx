import React, { useEffect, useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { convert } from "@/utils/currency";

type Props = {
  amount: number;
  currency: "USD" | "DOP";
  showConverted?: boolean;
  className?: string;
};

const Money = ({ amount, currency, showConverted = false, className }: Props) => {
  const { currency: current } = useCurrency();
  const [converted, setConverted] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (showConverted && current !== currency) {
        const v = await convert(amount, currency, current);
        if (active) setConverted(v);
      } else {
        setConverted(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [amount, currency, current, showConverted]);

  const format = (amt: number, cur: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amt);

  if (showConverted && converted !== null) {
    return (
      <span className={className}>
        {format(converted, current)} <span className="text-muted-foreground">({format(amount, currency)})</span>
      </span>
    );
  }

  return <span className={className}>{format(amount, currency)}</span>;
};

export default Money;