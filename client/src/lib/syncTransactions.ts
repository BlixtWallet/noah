import { useTransactionStore } from "~/store/transactionStore";
import { addTransaction, getTransactions } from "./transactionsDb";
import type { Transaction } from "../types/transaction";
import uuid from "react-native-uuid";
import { getHistoricalBtcToUsdRate } from "~/hooks/useMarketData";
import logger from "~/lib/log";
import { movements } from "./paymentsApi";
import type { BarkMovement as NitroBarkMovement, MovementStatus } from "react-native-nitro-ark";
import type { MovementKind } from "~/types/movement";
import { INCOMING_MOVEMENT_KINDS } from "~/types/movement";

const log = logger("useSyncManager");
type MovementWithKind = {
  movement: NitroBarkMovement;
  movementKind?: MovementKind;
};

const SUBSYSTEM_KIND_TO_MOVEMENT_KIND: Record<string, MovementKind> = {
  "bark.board:board": "onboard",
  "bark.arkoor:receive": "arkoor-receive",
  "bark.round:offboard": "offboard",
  "bark.round:send-onchain": "exit",
};

const INCOMING_MOVEMENT_KIND_SET = new Set<MovementKind>(INCOMING_MOVEMENT_KINDS);

export const syncArkReceives = async () => {
  const movementsResult = await movements();

  if (movementsResult.isErr()) {
    log.e("Failed to fetch movements:", [movementsResult.error]);
    return;
  }

  const allMovements = movementsResult.value;
  const movementsWithKind: MovementWithKind[] = allMovements.map((movement) => ({
    movement,
    movementKind: determineMovementKind(movement),
  }));

  const relevantMovements = movementsWithKind.filter(
    (entry): entry is MovementWithKind & { movementKind: MovementKind } =>
      Boolean(entry.movementKind),
  );

  if (relevantMovements.length === 0) {
    log.d("No relevant transactions found");
    useTransactionStore.getState().loadTransactions();
    return;
  }

  const currentTransactionsResult = await getTransactions();
  if (currentTransactionsResult.isErr()) {
    log.w("Could not get current transactions", [currentTransactionsResult.error]);
    return;
  }

  const currentTransactions = currentTransactionsResult.value;
  const knownTxIds = new Set(
    currentTransactions
      .map((tx) => tx.txid)
      .filter((txid): txid is string => typeof txid === "string" && txid.length > 0),
  );

  for (const { movement, movementKind } of relevantMovements) {
    const isIncoming = INCOMING_MOVEMENT_KIND_SET.has(movementKind);

    const uniqueId = getUniqueMovementId(movement, isIncoming);
    if (!uniqueId) {
      log.w(`Movement ${movement.id} has no VTXOs, skipping`, [movement]);
      continue;
    }

    if (!knownTxIds.has(uniqueId)) {
      const isArkoor = movementKind === "arkoor-receive";

      let transactionType: Transaction["type"];
      if (isArkoor) {
        transactionType = "Arkoor";
      } else {
        transactionType = "Onchain";
      }

      const totalAmount = getMovementAmount(movement, isIncoming);
      const movementDateIso = getMovementDateIso(movement.created_at);

      log.d(`Syncing new ${movementKind} transaction: ${movement.id}`, [movement]);

      const btcPriceResult = await getHistoricalBtcToUsdRate(movementDateIso);
      if (btcPriceResult.isErr()) {
        log.w("Could not get historical BTC price", [btcPriceResult.error]);
        continue;
      }

      const newTransaction: Transaction = {
        id: uuid.v4().toString(),
        txid: uniqueId,
        amount: totalAmount,
        date: movementDateIso,
        direction: isIncoming ? "incoming" : "outgoing",
        type: transactionType,
        btcPrice: btcPriceResult.value,
        description: "",
        destination: "",
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

      const addResult = await addTransaction(newTransaction);
      if (addResult.isErr()) {
        log.e("Failed to persist movement transaction", [addResult.error]);
        continue;
      }

      knownTxIds.add(uniqueId);
    }
  }

  log.d("Successfully synced transactions from movements API");
  await useTransactionStore.getState().loadTransactions();
};

const determineMovementKind = (movement: NitroBarkMovement): MovementKind | undefined => {
  const subsystemName = movement.subsystem?.name?.toLowerCase();
  const subsystemKind = movement.subsystem?.kind?.toLowerCase();

  if (!subsystemName || !subsystemKind) {
    return undefined;
  }

  const mappedKind = SUBSYSTEM_KIND_TO_MOVEMENT_KIND[`${subsystemName}:${subsystemKind}`];
  return mappedKind;
};

const getUniqueMovementId = (
  movement: NitroBarkMovement,
  isIncoming: boolean,
): string | undefined => {
  const candidateVtxos = isIncoming
    ? [...movement.output_vtxos, ...movement.input_vtxos, ...movement.exited_vtxos]
    : [...movement.input_vtxos, ...movement.output_vtxos, ...movement.exited_vtxos];

  return candidateVtxos.find((vtxoId) => typeof vtxoId === "string" && vtxoId.length > 0);
};

const sumDestinationAmounts = (destinations: { amount_sat: number }[] | undefined): number => {
  if (!destinations || destinations.length === 0) {
    return 0;
  }

  return destinations.reduce((sum, destination) => sum + destination.amount_sat, 0);
};

const getMovementAmount = (movement: NitroBarkMovement, isIncoming: boolean): number => {
  const routedAmount = isIncoming
    ? sumDestinationAmounts(movement.received_on)
    : sumDestinationAmounts(movement.sent_to);

  if (routedAmount > 0) {
    return routedAmount;
  }

  return Math.abs(movement.effective_balance_sat ?? 0);
};

const getMovementDateIso = (createdAt: string | undefined): string => {
  const parsedDate =
    parseDateString(createdAt) ??
    (createdAt && !createdAt.endsWith("Z") ? parseDateString(`${createdAt}Z`) : null);

  return (parsedDate ?? new Date()).toISOString();
};

const parseDateString = (value: string | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};
