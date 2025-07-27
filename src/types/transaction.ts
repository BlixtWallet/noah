import type { PaymentTypes } from "react-native-nitro-ark";

export type Transaction = {
  id: string;
  type: PaymentTypes;
  amount: number;
  date: string;
  description?: string;
  direction: "incoming" | "outgoing";
  txid?: string;
  preimage?: string;
  destination?: string;
  btcPrice?: number;
};

export type { PaymentTypes };
