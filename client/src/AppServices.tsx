import { memo, useEffect, useState } from "react";
import uuid from "react-native-uuid";
import { useSyncManager } from "~/hooks/useSyncManager";
import { useServerRegistration } from "~/hooks/useServerRegistration";
import { usePushNotifications } from "~/hooks/usePushNotifications";
import { useTransactionStore } from "~/store/transactionStore";
import { useBalance } from "~/hooks/useWallet";
import { useBoardAllAmountArk } from "~/hooks/usePayments";
import { useAlert } from "~/contexts/AlertProvider";
import { addOnboardingRequest } from "~/lib/transactionsDb";
import { reportLastLogin } from "~/lib/api";
import logger from "~/lib/log";
import { MIN_AUTO_BOARD_AMOUNT } from "./constants";

const log = logger("AppServices");

const AppServices = memo(() => {
  const [isReady, setIsReady] = useState(false);

  const { isAutoBoardingEnabled, hasAttemptedAutoBoarding, setHasAttemptedAutoBoarding } =
    useTransactionStore();
  const { data: balance } = useBalance();
  const { mutate: boardAllArk, isPending: isBoardingAll } = useBoardAllAmountArk();
  const { showAlert } = useAlert();

  // Initialize all app-level services here
  useSyncManager(60_000);
  useServerRegistration(isReady);
  usePushNotifications(isReady);

  useEffect(() => {
    setIsReady(true);
    useTransactionStore.getState().loadTransactions();
  }, []);

  useEffect(() => {
    if (isReady) {
      reportLastLogin().then((result) => {
        if (result.isErr()) {
          log.w("Failed to report last login", [result.error]);
        }
      });
    }
  }, [isReady]);

  // Auto-boarding logic
  useEffect(() => {
    if (
      !isReady ||
      !isAutoBoardingEnabled ||
      !balance ||
      isBoardingAll ||
      hasAttemptedAutoBoarding
    ) {
      return;
    }

    const onchainConfirmedBalance = balance.onchain.confirmed;

    if (onchainConfirmedBalance >= MIN_AUTO_BOARD_AMOUNT) {
      setHasAttemptedAutoBoarding(true);
      log.d("Auto-boarding triggered", [`Balance: ${onchainConfirmedBalance} sats`]);

      boardAllArk(undefined, {
        onSuccess: async (data) => {
          log.d("Auto-boarding successful");

          const onboardingRequestId = uuid.v4();

          const addResult = await addOnboardingRequest({
            request_id: onboardingRequestId,
            date: new Date().toISOString(),
            status: "completed",
            onchain_txid: data.funding_txid,
          });

          if (addResult.isErr()) {
            log.e("Failed to store auto-boarding request in database", [addResult.error]);
          } else {
            log.d("Successfully stored auto-boarding request", [onboardingRequestId]);
          }

          showAlert({
            title: "Auto-Boarded to Ark",
            description: `Successfully boarded ${onchainConfirmedBalance.toLocaleString()} sats to Ark.`,
          });
        },
        onError: (error) => {
          log.e("Auto-boarding failed", [error]);
        },
      });
    }
  }, [
    isReady,
    isAutoBoardingEnabled,
    hasAttemptedAutoBoarding,
    balance,
    boardAllArk,
    isBoardingAll,
    setHasAttemptedAutoBoarding,
    showAlert,
  ]);

  return null;
});

AppServices.displayName = "AppServices";

export default AppServices;
