import type { MovementStatus } from "react-native-nitro-ark";
import type { BarkSubsystemKind, BarkSubsystemName } from "~/lib/barkMovement";

export type PaymentTypes = "Bolt11" | "Bolt12" | "Lnurl" | "Arkoor" | "Onchain";
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
  subsystemName?: BarkSubsystemName;
  subsystemKind?: BarkSubsystemKind;
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

export type MovementDestination = {
  destination: string;
  amount_sat: number;
};
