import { useQuery } from "@tanstack/react-query";
import { getMnemonic } from "~/lib/crypto";
import { deriveKeypairFromMnemonic } from "~/lib/walletApi";
import { useWalletStore } from "~/store/walletStore";
import { APP_VARIANT } from "~/config";

export function useDeriveKeyPairFromMnemonic() {
  return useQuery({
    queryKey: ["peakKeyPair"],
    queryFn: async () => {
      const cachedKey = useWalletStore.getState().staticVtxoPubkey;
      if (cachedKey) {
        return { public_key: cachedKey };
      }

      const mnemonicResult = await getMnemonic();
      if (mnemonicResult.isErr()) {
        throw mnemonicResult.error;
      }

      const derivedKeyResult = await deriveKeypairFromMnemonic(
        mnemonicResult.value,
        APP_VARIANT,
        0,
      );
      if (derivedKeyResult.isErr()) {
        throw derivedKeyResult.error;
      }

      const derivedKey = derivedKeyResult.value.public_key;
      useWalletStore.getState().setStaticVtxoPubkey(derivedKey);

      return { public_key: derivedKey };
    },
  });
}
