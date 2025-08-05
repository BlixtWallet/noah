import { useQuery } from "@tanstack/react-query";
import { mempoolPriceEndpoint, mempoolHistoricalPriceEndpoint } from "~/constants";

export const getBtcToUsdRate = async (): Promise<number> => {
  try {
    const response = await fetch(mempoolPriceEndpoint);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    if (data.USD) {
      return data.USD;
    }
    throw new Error("Invalid response from exchange rate API");
  } catch (error) {
    console.error("Failed to fetch BTC to USD rate:", error);
    throw new Error("Failed to fetch exchange rate");
  }
};

export function useBtcToUsdRate() {
  return useQuery({
    queryKey: ["btcToUsdRate"],
    queryFn: getBtcToUsdRate,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export const getHistoricalBtcToUsdRate = async (date: string): Promise<number> => {
  try {
    const timestamp = Math.floor(new Date(date).getTime() / 1000);
    const response = await fetch(
      `${mempoolHistoricalPriceEndpoint}?currency=USD&timestamp=${timestamp}`,
    );
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    if (data.prices && data.prices.length > 0 && data.prices[0].USD) {
      return data.prices[0].USD;
    }
    // If no price is available for that day, fetch the current price as a fallback.
    return getBtcToUsdRate();
  } catch (error) {
    console.error("Failed to fetch historical BTC to USD rate:", error);
    // Fallback to current price on error
    return getBtcToUsdRate();
  }
};
