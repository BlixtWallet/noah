import { useEffect, useState } from "react";
import { authorizeMailbox } from "~/lib/api";
import { getMailboxAuthorization, loadWalletIfNeeded } from "~/lib/walletApi";
import logger from "~/lib/log";
import { useServerStore } from "~/store/serverStore";

const log = logger("useMailboxAuthorization");

// Keep a buffer below the server's 90-day hard cap so device/server clock skew
// does not cause the authorization request to be rejected.
const MAILBOX_AUTH_TTL_SECS = 89 * 24 * 60 * 60;
const MAILBOX_AUTH_REFRESH_WINDOW_SECS = 7 * 24 * 60 * 60;

export const useMailboxAuthorization = (isReady: boolean) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const {
    isRegisteredWithServer,
    mailboxAuthorizationExpiry,
    isMailboxAuthorizationEnabled,
    setMailboxAuthorizationExpiry,
  } = useServerStore();

  useEffect(() => {
    let isCancelled = false;
    const shouldAbort = () => {
      const { isMailboxAuthorizationEnabled: isEnabled, isRegisteredWithServer: isRegistered } =
        useServerStore.getState();
      return isCancelled || !isEnabled || !isRegistered;
    };

    const registerMailboxAuthorization = async () => {
      if (!isReady || !isRegisteredWithServer || !isMailboxAuthorizationEnabled) {
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (
        mailboxAuthorizationExpiry &&
        mailboxAuthorizationExpiry > now + MAILBOX_AUTH_REFRESH_WINDOW_SECS
      ) {
        return;
      }

      const loadResult = await loadWalletIfNeeded();
      if (loadResult.isErr()) {
        log.w("Failed to load wallet before granting mailbox authorization", [loadResult.error]);
        return;
      }
      if (shouldAbort()) {
        return;
      }

      const requestedExpiry = now + MAILBOX_AUTH_TTL_SECS;
      const mailboxAuthorizationResult = await getMailboxAuthorization(requestedExpiry);
      if (mailboxAuthorizationResult.isErr()) {
        log.w("Failed to generate mailbox authorization", [mailboxAuthorizationResult.error]);
        return;
      }
      if (shouldAbort()) {
        return;
      }
      const authorizeResult = await authorizeMailbox(mailboxAuthorizationResult.value);
      if (authorizeResult.isErr()) {
        log.w("Failed to store mailbox authorization on server", [authorizeResult.error]);
        return;
      }

      if (shouldAbort()) {
        return;
      }

      setMailboxAuthorizationExpiry(mailboxAuthorizationResult.value.expiry);
      log.d("Successfully granted mailbox authorization", [
        mailboxAuthorizationResult.value.expiry,
      ]);
    };

    registerMailboxAuthorization();

    return () => {
      isCancelled = true;
    };
  }, [
    isReady,
    isRegisteredWithServer,
    isMailboxAuthorizationEnabled,
    mailboxAuthorizationExpiry,
    refreshTick,
    setMailboxAuthorizationExpiry,
  ]);

  useEffect(() => {
    if (
      !isReady ||
      !isRegisteredWithServer ||
      !isMailboxAuthorizationEnabled ||
      !mailboxAuthorizationExpiry
    ) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const refreshAt = mailboxAuthorizationExpiry - MAILBOX_AUTH_REFRESH_WINDOW_SECS;
    const delayMs = Math.max((refreshAt - now) * 1000, 0);

    const timeout = setTimeout(() => {
      setRefreshTick((tick) => tick + 1);
    }, delayMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    isReady,
    isRegisteredWithServer,
    isMailboxAuthorizationEnabled,
    mailboxAuthorizationExpiry,
  ]);
};
