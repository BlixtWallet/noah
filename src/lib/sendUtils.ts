import { decodeBolt11, isArkPublicKey, isValidBitcoinAddress, isValidBolt11 } from "../constants";

export type DestinationTypes = "onchain" | "lightning" | "ark" | null;

export type ParsedDestination = {
  destinationType: DestinationTypes;
  amount?: number;
  isAmountEditable: boolean;
  error?: string;
};

export const isValidDestination = (dest: string): boolean => {
  const cleanedDest = dest.replace(/^(bitcoin:|lightning:)/i, "");
  return (
    isArkPublicKey(cleanedDest) || isValidBitcoinAddress(cleanedDest) || isValidBolt11(cleanedDest)
  );
};

export const parseDestination = (destination: string): ParsedDestination => {
  const cleanedDestination = destination.replace(/^(bitcoin:|lightning:)/i, "");

  if (isValidBolt11(cleanedDestination)) {
    try {
      const decoded = decodeBolt11(cleanedDestination);
      if (decoded === null) {
        throw new Error("Invalid invoice");
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
    } catch (e) {
      console.error("Failed to decode bolt11 invoice", e);
      return {
        destinationType: null,
        isAmountEditable: true,
        error: "Failed to decode bolt11 invoice",
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
  }

  return {
    destinationType: null,
    isAmountEditable: true,
  };
};
