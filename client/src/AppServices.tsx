import { memo, useEffect, useState, useRef } from "react";
import uuid from "react-native-uuid";
import { useSyncManager } from "~/hooks/useSyncManager";
import { useServerRegistration } from "~/hooks/useServerRegistration";
import { usePushNotifications } from "~/hooks/usePushNotifications";
import { useTransactionStore } from "~/store/transactionStore";
import { useBalance } from "~/hooks/useWallet";
import { useBoardAllAmountArk } from "~/hooks/usePayments";
import { useAlert } from "~/contexts/AlertProvider";
import { addOnboardingRequest } from "~/lib/transactionsDb";
import { Result } from "neverthrow";
import logger from "~/lib/log";

const log = logger("AppServices");

const AppServices = memo(() => {
  const [isReady, setIsReady] = useState(false);
  const hasAttemptedAutoBoard = useRef(false);

  const { isAutoBoardingEnabled } = useTransactionStore();
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

  // Auto-boarding logic
  useEffect(() => {
    if (!isReady || !isAutoBoardingEnabled || !balance || isBoardingAll) {
      return;
    }

    const onchainConfirmedBalance = balance.onchain.confirmed;
    const MIN_AUTO_BOARD_AMOUNT = 20_000;

    if (onchainConfirmedBalance >= MIN_AUTO_BOARD_AMOUNT && !hasAttemptedAutoBoard.current) {
      hasAttemptedAutoBoard.current = true;
      log.d("Auto-boarding triggered", [`Balance: ${onchainConfirmedBalance} sats`]);

      boardAllArk(undefined, {
        onSuccess: async (data) => {
          log.d("Auto-boarding successful");

          const parseResult = Result.fromThrowable(JSON.parse)(data);
          if (parseResult.isOk()) {
            const parsedData = parseResult.value;
            const onboardingRequestId = uuid.v4();

            const addResult = await addOnboardingRequest({
              request_id: onboardingRequestId,
              date: new Date().toISOString(),
              status: "completed",
              onchain_txid: parsedData.funding_txid,
            });

            if (addResult.isErr()) {
              log.e("Failed to store auto-boarding request in database", [addResult.error]);
            } else {
              log.d("Successfully stored auto-boarding request", [onboardingRequestId]);
            }
          } else {
            log.e("Failed to parse auto-boarding result", [parseResult.error]);
          }

          showAlert({
            title: "Auto-Boarded to Ark",
            description: `Successfully boarded ${onchainConfirmedBalance.toLocaleString()} sats to Ark.`,
          });
        },
        onError: (error) => {
          log.e("Auto-boarding failed", [error]);
          hasAttemptedAutoBoard.current = false;
        },
      });
    }
  }, [isReady, isAutoBoardingEnabled, balance, boardAllArk, isBoardingAll, showAlert]);

  return null;
});

AppServices.displayName = "AppServices";

export default AppServices;
