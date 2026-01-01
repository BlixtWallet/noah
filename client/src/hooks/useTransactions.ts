import { useQuery } from "@tanstack/react-query";
import { history } from "~/lib/paymentsApi";
import type { Transaction, PaymentTypes } from "~/types/transaction";
import type { BarkMovement, MovementStatus } from "react-native-nitro-ark";
import type { MovementKind } from "~/types/movement";
import { INCOMING_MOVEMENT_KINDS } from "~/types/movement";
import { getHistoricalBtcToUsdRate } from "~/hooks/useMarketData";
import logger from "~/lib/log";

const log = logger("useTransactions");

const SUBSYSTEM_KIND_TO_MOVEMENT_KIND: Record<string, MovementKind> = {
  "bark.board:board": "onboard",
  "bark.arkoor:receive": "arkoor-receive",
  "bark.round:offboard": "offboard",
  "bark.round:send_onchain": "offboard",
  "bark.exit:start": "exit",
  "bark.lightning_receive:receive": "lightning-receive",
};

const OUTGOING_SUBSYSTEM_KEYS = new Set([
  "bark.round:offboard",
  "bark.round:send_onchain",
  "bark.arkoor:send",
  "bark.lightning_send:send",
  "bark.exit:start",
]);

const INCOMING_MOVEMENT_KIND_SET = new Set<MovementKind>(INCOMING_MOVEMENT_KINDS);

const determineMovementKind = (movement: BarkMovement): MovementKind | undefined => {
  const subsystemName = movement.subsystem?.name?.toLowerCase();
  const subsystemKind = movement.subsystem?.kind?.toLowerCase();

  if (!subsystemName || !subsystemKind) {
    return undefined;
  }

  return SUBSYSTEM_KIND_TO_MOVEMENT_KIND[`${subsystemName}:${subsystemKind}`];
};

const isOutgoingMovement = (movement: BarkMovement): boolean => {
  const subsystemName = movement.subsystem?.name?.toLowerCase();
  const subsystemKind = movement.subsystem?.kind?.toLowerCase();

  if (!subsystemName || !subsystemKind) {
    if (movement.effective_balance_sat !== undefined && movement.effective_balance_sat < 0) {
      return true;
    }
    return false;
  }

  const key = `${subsystemName}:${subsystemKind}`;
  if (OUTGOING_SUBSYSTEM_KEYS.has(key)) {
    return true;
  }

  const movementKind = determineMovementKind(movement);
  if (movementKind && INCOMING_MOVEMENT_KIND_SET.has(movementKind)) {
    return false;
  }

  if (movement.effective_balance_sat !== undefined && movement.effective_balance_sat < 0) {
    return true;
  }

  return false;
};

const sumDestinationAmounts = (destinations: { amount_sat: number }[] | undefined): number => {
  if (!destinations || destinations.length === 0) {
    return 0;
  }
  return destinations.reduce((sum, dest) => sum + dest.amount_sat, 0);
};

const getMovementAmount = (movement: BarkMovement, isOutgoing: boolean): number => {
  const routedAmount = isOutgoing
    ? sumDestinationAmounts(movement.sent_to)
    : sumDestinationAmounts(movement.received_on);

  if (routedAmount > 0) {
    return routedAmount;
  }

  return Math.abs(movement.effective_balance_sat ?? 0);
};

const getMovementDateIso = (createdAt: string | undefined): string => {
  if (!createdAt) {
    return new Date().toISOString();
  }

  let parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime()) && !createdAt.endsWith("Z")) {
    parsed = new Date(`${createdAt}Z`);
  }

  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const getUniqueMovementId = (movement: BarkMovement, isOutgoing: boolean): string => {
  const candidateVtxos = isOutgoing
    ? [...movement.input_vtxos, ...movement.output_vtxos, ...movement.exited_vtxos]
    : [...movement.output_vtxos, ...movement.input_vtxos, ...movement.exited_vtxos];

  const vtxoId = candidateVtxos.find((id) => typeof id === "string" && id.length > 0);
  return vtxoId ?? `movement-${movement.id}`;
};

const determineTransactionType = (
  movement: BarkMovement,
  movementKind: MovementKind | undefined,
  isOutgoing: boolean,
): PaymentTypes => {
  if (movementKind === "lightning-receive") {
    return "Bolt11";
  }

  if (movementKind === "arkoor-receive") {
    return "Arkoor";
  }

  const subsystemName = movement.subsystem?.name?.toLowerCase();
  const subsystemKind = movement.subsystem?.kind?.toLowerCase();

  if (subsystemName === "bark.lightning_send" || subsystemKind === "send") {
    return "Bolt11";
  }

  if (subsystemName === "bark.arkoor" && subsystemKind === "send") {
    return "Arkoor";
  }

  if (
    movementKind === "offboard" ||
    movementKind === "onboard" ||
    movementKind === "exit" ||
    subsystemKind === "send_onchain"
  ) {
    return "Onchain";
  }

  if (isOutgoing && movement.sent_to && movement.sent_to.length > 0) {
    return "Arkoor";
  }

  return "Onchain";
};

const transformMovementToTransaction = async (movement: BarkMovement): Promise<Transaction> => {
  const movementKind = determineMovementKind(movement);
  const isOutgoing = isOutgoingMovement(movement);
  const direction = isOutgoing ? "outgoing" : "incoming";

  const createdAt =
    (movement as { time?: { created_at?: string } }).time?.created_at ?? movement.created_at;
  const dateIso = getMovementDateIso(createdAt);
  const amount = getMovementAmount(movement, isOutgoing);
  const txid = getUniqueMovementId(movement, isOutgoing);
  const transactionType = determineTransactionType(movement, movementKind, isOutgoing);

  let btcPrice: number | undefined;
  const btcPriceResult = await getHistoricalBtcToUsdRate(dateIso);
  if (btcPriceResult.isOk()) {
    btcPrice = btcPriceResult.value;
  }

  const destination = isOutgoing
    ? movement.sent_to?.[0]?.destination
    : movement.received_on?.[0]?.destination;

  return {
    id: `movement-${movement.id}`,
    txid,
    amount,
    date: dateIso,
    direction,
    type: transactionType,
    btcPrice,
    description: "",
    destination: destination ?? "",
    movementId: movement.id,
    movementStatus: movement.status as MovementStatus,
    movementKind,
    subsystemName: movement.subsystem?.name,
    subsystemKind: movement.subsystem?.kind,
    metadataJson: movement.metadata_json,
    intendedBalanceSat: movement.intended_balance_sat,
    effectiveBalanceSat: movement.effective_balance_sat,
    offchainFeeSat: movement.offchain_fee_sat,
    sentTo: movement.sent_to,
    receivedOn: movement.received_on,
    inputVtxos: movement.input_vtxos,
    outputVtxos: movement.output_vtxos,
    exitedVtxos: movement.exited_vtxos,
  };
};

const fetchAndTransformTransactions = async (): Promise<Transaction[]> => {
  const movementsResult = await history();

  if (movementsResult.isErr()) {
    log.e("Failed to fetch movements:", [movementsResult.error]);
    throw movementsResult.error;
  }

  const movements = movementsResult.value;

  if (movements.length === 0) {
    return [];
  }

  const transactions = await Promise.all(movements.map(transformMovementToTransaction));

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const useTransactions = () => {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: fetchAndTransformTransactions,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const useTransaction = (transactionId: string) => {
  const { data: transactions, ...rest } = useTransactions();

  const transaction = transactions?.find((t) => t.id === transactionId);

  return {
    data: transaction,
    ...rest,
  };
};
