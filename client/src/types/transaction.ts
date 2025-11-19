import type { MovementStatus, PaymentTypes } from "react-native-nitro-ark";
import type { MovementKind } from "./movement";

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
  movementId?: number;
  movementStatus?: MovementStatus;
  movementKind?: MovementKind;
  subsystemName?: string;
  subsystemKind?: string;
  metadataJson?: string;
  intendedBalanceSat?: number;
  effectiveBalanceSat?: number;
  offchainFeeSat?: number;
  sentTo?: MovementDestination[];
  receivedOn?: MovementDestination[];
  inputVtxos?: string[];
  outputVtxos?: string[];
  exitedVtxos?: string[];
};

export type { PaymentTypes };

export type MovementDestination = {
  destination: string;
  amount_sat: number;
};
