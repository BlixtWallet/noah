import { useQuery } from "@tanstack/react-query";
import { mempoolPriceEndpoint, mempoolHistoricalPriceEndpoint } from "~/constants";

import { err, ok, Result } from "neverthrow";
export const getBtcToUsdRate = async (): Promise<Result<number, Error>> => {
  try {
    const response = await fetch(mempoolPriceEndpoint);
    if (!response.ok) {
      return err(new Error("Network response was not ok"));
    }
    const data = await response.json();
    if (data.USD) {
      return ok(data.USD);
    }
    return err(new Error("Invalid response from exchange rate API"));
  } catch (error) {
    console.error("Failed to fetch BTC to USD rate:", error);
    return err(new Error("Failed to fetch exchange rate"));
  }
};

export function useBtcToUsdRate() {
  return useQuery({
    queryKey: ["btcToUsdRate"],
    queryFn: async () => {
      const result = await getBtcToUsdRate();
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export const getHistoricalBtcToUsdRate = async (date: string): Promise<Result<number, Error>> => {
  try {
    const timestamp = Math.floor(new Date(date).getTime() / 1000);
    const response = await fetch(
      `${mempoolHistoricalPriceEndpoint}?currency=USD&timestamp=${timestamp}`,
    );
    if (!response.ok) {
      return err(new Error("Network response was not ok"));
    }
    const data = await response.json();
    if (data.prices && data.prices.length > 0 && data.prices[0].USD) {
      return ok(data.prices[0].USD);
    }
    // If no price is available for that day, fetch the current price as a fallback.
    return getBtcToUsdRate();
  } catch (error) {
    console.error("Failed to fetch historical BTC to USD rate:", error);
    // Fallback to current price on error
    return getBtcToUsdRate();
  }
};
