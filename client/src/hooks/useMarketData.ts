import { useQuery } from "@tanstack/react-query";
import { mempoolPriceEndpoint, mempoolHistoricalPriceEndpoint } from "~/constants";
import ky from "ky";

import { err, ok, ResultAsync } from "neverthrow";
export const getBtcToUsdRate = (): ResultAsync<number, Error> => {
  return ResultAsync.fromPromise(
    ky.get(mempoolPriceEndpoint).json<{ USD?: number }>(),
    (e) => new Error(`Failed to fetch BTC to USD rate: ${e}`),
  ).andThen((data) => {
    const rate = data.USD;
    if (rate) {
      return ok(rate);
    }
    return err(new Error("Invalid response from exchange rate API"));
  });
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

export const getHistoricalBtcToUsdRate = (date: string): ResultAsync<number, Error> => {
  const timestamp = Math.floor(new Date(date).getTime() / 1000);
  return ResultAsync.fromPromise(
    ky
      .get(mempoolHistoricalPriceEndpoint, {
        searchParams: {
          currency: "USD",
          timestamp: timestamp.toString(),
        },
      })
      .json<{ prices?: { USD?: number }[] }>(),
    (e) => new Error(`Failed to fetch historical BTC to USD rate: ${e}`),
  )
    .andThen((data) => {
      const prices = data.prices;
      if (prices && prices.length > 0 && prices[0].USD) {
        return ok(prices[0].USD);
      }
      // If no price is available for that day, fetch the current price as a fallback.
      return getBtcToUsdRate();
    })
    .orElse((error) => {
      console.error("Failed to fetch historical BTC to USD rate:", error);
      // Fallback to current price on error
      return getBtcToUsdRate();
    });
};
