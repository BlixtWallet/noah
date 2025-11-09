import { decodeBolt11, isValidLightningAddress } from "../constants";
import {
  parseBIP321,
  type BIP321ParseResult,
  validateBitcoinAddress,
  validateLightningInvoice,
  validateArkAddress,
} from "bip-321";
import { APP_VARIANT } from "../config";
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

const isNetworkMatch = (network: string | undefined, paymentType: "ark" | "other"): boolean => {
  if (!network) return false;

  if (paymentType === "ark") {
    // For Ark, testnet covers testnet, signet, and regtest
    if (APP_VARIANT === "mainnet") {
      return network === "mainnet";
    } else {
      // APP_VARIANT is testnet, signet, or regtest
      // Ark network should be "testnet"
      return network === "testnet";
    }
  } else {
    // For Bitcoin addresses and Lightning invoices, exact network match required
    return network === APP_VARIANT;
  }
};

export const isValidDestination = (dest: string): boolean => {
  if (dest.toLowerCase().startsWith("bitcoin:")) {
    const expectedNetwork = APP_VARIANT;
    const result = parseBIP321(dest, expectedNetwork);
    return result.valid && result.paymentMethods.length > 0;
  }

  const cleanedDest = dest.replace(/^(lightning:)/i, "");

  // Check Bitcoin address
  const btcResult = validateBitcoinAddress(cleanedDest);
  if (btcResult.valid && isNetworkMatch(btcResult.network, "other")) {
    return true;
  }

  // Check Lightning invoice (BOLT11)
  const lnResult = validateLightningInvoice(cleanedDest);
  if (lnResult.valid && isNetworkMatch(lnResult.network, "other")) {
    return true;
  }

  // Check Ark address
  const arkResult = validateArkAddress(cleanedDest);
  if (arkResult.valid && isNetworkMatch(arkResult.network, "ark")) {
    return true;
  }

  // Check Lightning address (LNURL)
  if (isValidLightningAddress(cleanedDest)) {
    return true;
  }

  return false;
};

const btcToSats = (btc: number) => {
  return Math.round(btc * 100_000_000);
};

export const parseBip321Uri = (uri: string): ParsedDestination => {
  try {
    const expectedNetwork = APP_VARIANT;
    const result: BIP321ParseResult = parseBIP321(uri, expectedNetwork);

    if (!result.valid) {
      const errorMsg = result.errors.join(", ");
      log.w("Failed to parse BIP-321 URI", [errorMsg]);
      return {
        destinationType: null,
        isAmountEditable: true,
        error: errorMsg || "Invalid BIP-321 URI",
      };
    }

    if (result.paymentMethods.length === 0) {
      return {
        destinationType: null,
        isAmountEditable: true,
        error: "No valid payment methods found",
      };
    }

    const bip321: ParsedBip321 = {};

    // Extract payment methods
    for (const method of result.paymentMethods) {
      if (!method.valid) continue;

      switch (method.type) {
        case "onchain":
          bip321.onchainAddress = method.value;
          break;
        case "ark":
          bip321.arkAddress = method.value;
          break;
        case "lightning":
          bip321.lightningInvoice = method.value;
          break;
      }
    }

    const parsed: ParsedDestination = {
      destinationType: "bip321",
      isAmountEditable: !result.amount,
      bip321,
    };

    if (result.amount) {
      parsed.amount = btcToSats(result.amount);
    }

    return parsed;
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
  }

  const lnResult = validateLightningInvoice(cleanedDestination);
  if (lnResult.valid) {
    if (!isNetworkMatch(lnResult.network, "other")) {
      return {
        destinationType: null,
        isAmountEditable: true,
        error: `Network mismatch: expected ${APP_VARIANT}, got ${lnResult.network}`,
      };
    }
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
  }

  const btcResult = validateBitcoinAddress(cleanedDestination);
  if (btcResult.valid) {
    if (!isNetworkMatch(btcResult.network, "other")) {
      return {
        destinationType: null,
        isAmountEditable: true,
        error: `Network mismatch: expected ${APP_VARIANT}, got ${btcResult.network}`,
      };
    }
    return {
      destinationType: "onchain",
      isAmountEditable: true,
    };
  }

  const arkResult = validateArkAddress(cleanedDestination);
  if (arkResult.valid) {
    if (!isNetworkMatch(arkResult.network, "ark")) {
      return {
        destinationType: null,
        isAmountEditable: true,
        error: `Network mismatch: expected ${APP_VARIANT}, got ${arkResult.network}`,
      };
    }
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
