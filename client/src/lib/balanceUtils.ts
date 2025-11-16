import type { OnchainBalanceResult, OffchainBalanceResult } from "react-native-nitro-ark";

export interface BalanceData {
  totalBalance: number;
  onchainBalance: number;
  offchainBalance: number;
  pendingBalance: number;
}

export interface BalanceResults {
  onchain: OnchainBalanceResult;
  offchain: OffchainBalanceResult;
}

/**
 * Calculate onchain balance from balance result
 */
export function calculateOnchainBalance(onchain: OnchainBalanceResult): number {
  return (
    (onchain.confirmed ?? 0) +
    (onchain.immature ?? 0) +
    (onchain.trusted_pending ?? 0) +
    (onchain.untrusted_pending ?? 0)
  );
}

/**
 * Calculate offchain balance from balance result
 */
export function calculateOffchainBalance(offchain: OffchainBalanceResult): number {
  return (
    (offchain.pending_exit ?? 0) +
    (offchain.pending_lightning_send ?? 0) +
    (offchain.pending_lightning_receive?.claimable ?? 0) +
    (offchain.pending_in_round ?? 0) +
    (offchain.spendable ?? 0) +
    (offchain.pending_board ?? 0)
  );
}

/**
 * Calculate total pending balance from balance results
 */
export function calculatePendingBalance(
  onchain: OnchainBalanceResult,
  offchain: OffchainBalanceResult,
): number {
  return (
    (onchain.trusted_pending ?? 0) +
    (onchain.untrusted_pending ?? 0) +
    (onchain.immature ?? 0) +
    (offchain.pending_exit ?? 0) +
    (offchain.pending_lightning_send ?? 0) +
    (offchain.pending_in_round ?? 0) +
    (offchain.pending_board ?? 0)
  );
}

/**
 * Calculate all balances from balance results
 */
export function calculateBalances(balance: BalanceResults): BalanceData {
  const onchainBalance = calculateOnchainBalance(balance.onchain);
  const offchainBalance = calculateOffchainBalance(balance.offchain);
  const pendingBalance = calculatePendingBalance(balance.onchain, balance.offchain);
  const totalBalance = onchainBalance + offchainBalance;

  return {
    totalBalance,
    onchainBalance,
    offchainBalance,
    pendingBalance,
  };
}
