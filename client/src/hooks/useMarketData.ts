import { useQuery } from "@tanstack/react-query";
import { mempoolPriceEndpoint, mempoolHistoricalPriceEndpoint } from "~/constants";

import { err, ok, ResultAsync } from "neverthrow";
export const getBtcToUsdRate = (): ResultAsync<number, Error> => {
  return ResultAsync.fromPromise(
    fetch(mempoolPriceEndpoint),
    (e) => new Error(`Failed to fetch BTC to USD rate: ${e}`),
  )
    .andThen((response) => {
      if (!response.ok) {
        return err(new Error("Network response was not ok"));
      }
      return ResultAsync.fromPromise(
        response.json(),
        (e) => new Error(`Failed to parse response: ${e}`),
      );
    })
    .andThen((data) => {
      const rate = (data as { USD?: number }).USD;
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
    fetch(`${mempoolHistoricalPriceEndpoint}?currency=USD&timestamp=${timestamp}`),
    (e) => new Error(`Failed to fetch historical BTC to USD rate: ${e}`),
  )
    .andThen((response) => {
      if (!response.ok) {
        return err(new Error("Network response was not ok"));
      }
      return ResultAsync.fromPromise(
        response.json(),
        (e) => new Error(`Failed to parse historical response: ${e}`),
      );
    })
    .andThen((data) => {
      const prices = (data as { prices?: { USD?: number }[] }).prices;
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
