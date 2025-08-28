import { useState, useMemo } from "react";
import { useBtcToUsdRate } from "./useMarketData";

export const useReceiveScreen = () => {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"SATS" | "USD">("SATS");
  const { data: btcPrice } = useBtcToUsdRate();

  const toggleCurrency = () => {
    if (currency === "SATS") {
      if (btcPrice && amount) {
        setAmount(((parseInt(amount, 10) * btcPrice) / 100000000).toFixed(2));
      }
      setCurrency("USD");
    } else {
      if (btcPrice && amount) {
        setAmount(Math.round((parseFloat(amount) / btcPrice) * 100000000).toString());
      }
      setCurrency("SATS");
    }
  };

  const amountSat = useMemo(() => {
    if (!btcPrice) return 0;
    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat)) return 0;

    if (currency === "SATS") {
      return Math.round(amountFloat);
    } else {
      return Math.round((amountFloat / btcPrice) * 100000000);
    }
  }, [amount, currency, btcPrice]);

  return {
    amount,
    setAmount,
    currency,
    toggleCurrency,
    amountSat,
    btcPrice,
  };
};
