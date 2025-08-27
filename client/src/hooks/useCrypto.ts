import { useQuery } from "@tanstack/react-query";
import { peakKeyPair } from "~/lib/crypto";
import { useWalletStore } from "~/store/walletStore";

export function usePeakKeyPair() {
  return useQuery({
    queryKey: ["peakKeyPair"],
    queryFn: async () => {
      const pubkey = useWalletStore.getState().config.staticVtxoPubkey;
      if (pubkey) {
        return { public_key: pubkey };
      }

      const result = await peakKeyPair(0);
      if (result.isErr()) {
        throw result.error;
      }

      useWalletStore.getState().setStaticVtxoPubkey(result.value.public_key);

      return { public_key: result.value.public_key };
    },
  });
}
