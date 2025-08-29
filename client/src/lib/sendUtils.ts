import {
  decodeBolt11,
  isArkPublicKey,
  isValidArkAddress,
  isValidBitcoinAddress,
  isValidBolt11,
  isValidLightningAddress,
} from "../constants";
import logger from "./log";

const log = logger("sendUtils");

export type DestinationTypes = "onchain" | "lightning" | "ark" | "lnurl" | "bip321" | null;

export type ParsedBip321 = {
  onchainAddress?: string;
  arkAddress?: string;
  lightningInvoice?: string;
};

export type ParsedDestination = {
  destinationType: DestinationTypes;
  amount?: number;
  isAmountEditable: boolean;
  error?: string;
  bip321?: ParsedBip321;
};

export const isValidDestination = (dest: string): boolean => {
  if (dest.toLowerCase().startsWith("bitcoin:")) {
    try {
      const url = new URL(dest);
      // For BIP-321 URIs, the onchain address is optional
      // Check if we have at least one valid payment method
      const onchainAddress = url.pathname;
      const arkAddress = url.searchParams.get("ark") || url.searchParams.get("ARK");
      const lightningInvoice =
        url.searchParams.get("lightning") || url.searchParams.get("LIGHTNING");

      // Valid if we have at least one payment method
      const hasOnchain = !!(onchainAddress && isValidBitcoinAddress(onchainAddress));
      const hasArk = !!(
        arkAddress &&
        (isArkPublicKey(arkAddress) || isValidArkAddress(arkAddress))
      );
      const hasLightning = !!(lightningInvoice && isValidBolt11(lightningInvoice));

      return hasOnchain || hasArk || hasLightning;
    } catch (e) {
      log.w("Failed to parse BIP-321 URI", [e]);
      return false;
    }
  }
  const cleanedDest = dest.replace(/^(lightning:)/i, "");
  return (
    isArkPublicKey(cleanedDest) ||
    isValidBitcoinAddress(cleanedDest) ||
    isValidBolt11(cleanedDest) ||
    isValidLightningAddress(cleanedDest) ||
    isValidArkAddress(cleanedDest)
  );
};

const btcToSats = (btc: number) => {
  return Math.round(btc * 100_000_000);
};

export const parseBip321Uri = (uri: string): ParsedDestination => {
  try {
    const url = new URL(uri);
    const onchainAddress = url.pathname;
    const amountBtc = url.searchParams.get("amount") || url.searchParams.get("AMOUNT");
    const arkAddress = url.searchParams.get("ark") || url.searchParams.get("ARK");
    const lightningInvoice = url.searchParams.get("lightning") || url.searchParams.get("LIGHTNING");

    const bip321: ParsedBip321 = { onchainAddress };
    if (arkAddress) bip321.arkAddress = arkAddress;
    if (lightningInvoice) bip321.lightningInvoice = lightningInvoice;

    const result: ParsedDestination = {
      destinationType: "bip321",
      isAmountEditable: !amountBtc,
      bip321,
    };

    if (amountBtc) {
      result.amount = btcToSats(parseFloat(amountBtc));
    }

    return result;
  } catch (error) {
    log.w("Failed to parse BIP-321 URI", [error]);
    return {
      destinationType: null,
      isAmountEditable: true,
      error: "Invalid BIP-321 URI",
    };
  }
};

export const parseDestination = (destination: string): ParsedDestination => {
  if (destination.toLowerCase().startsWith("bitcoin:")) {
    return parseBip321Uri(destination);
  }

  const cleanedDestination = destination.replace(/^(lightning:)/i, "");

  if (isValidLightningAddress(cleanedDestination)) {
    return {
      destinationType: "lnurl",
      isAmountEditable: true,
    };
  } else if (isValidBolt11(cleanedDestination)) {
    const decoded = decodeBolt11(cleanedDestination);
    if (decoded === null) {
      return {
        destinationType: null,
        isAmountEditable: true,
        error: "Failed to decode bolt11 invoice",
      };
    }

    const msats = decoded.sections.find((n) => n.name === "amount")?.value;

    if (msats === undefined) {
      return {
        destinationType: "lightning",
        isAmountEditable: true,
      };
    }

    if (Number(msats) > 0 && Number(msats) < 1000) {
      return {
        destinationType: "lightning",
        isAmountEditable: true,
        error: "Invoice amount is less than 1 satoshi.",
      };
    }

    const sats = Number(msats) / 1000;

    if (sats >= 1) {
      return {
        destinationType: "lightning",
        amount: sats,
        isAmountEditable: false,
      };
    } else {
      return {
        destinationType: "lightning",
        isAmountEditable: true,
      };
    }
  } else if (isValidBitcoinAddress(cleanedDestination)) {
    return {
      destinationType: "onchain",
      isAmountEditable: true,
    };
  } else if (isArkPublicKey(cleanedDestination)) {
    return {
      destinationType: "ark",
      isAmountEditable: true,
    };
  } else if (isValidArkAddress(cleanedDestination)) {
    return {
      destinationType: "ark",
      isAmountEditable: true,
    };
  }

  return {
    destinationType: null,
    isAmountEditable: true,
  };
};
