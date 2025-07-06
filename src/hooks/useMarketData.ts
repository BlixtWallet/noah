import { useQuery } from "@tanstack/react-query";
import { coingeckoEndpoint } from "~/constants";

export const getBtcToUsdRate = async (): Promise<number> => {
  try {
    const response = await fetch(coingeckoEndpoint);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    if (data.bitcoin && data.bitcoin.usd) {
      return data.bitcoin.usd;
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
