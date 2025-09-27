import { useRouter, useLocalSearchParams, usePathname } from "expo-router";
import { useCallback } from "react";

type NavigationParams = Record<string, string | number | boolean | object | undefined>;

export function useAppNavigation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const pathname = usePathname();

  const navigate = useCallback(
    (screen: string, screenParams?: NavigationParams) => {
      let path = "";

      // Map old navigation names to new Expo Router paths
      switch (screen) {
        // Home Stack screens
        case "HomeStack":
        case "Home":
          path = "/(tabs)/(home)";
          break;
        case "BoardArk":
          path = "/(tabs)/(home)/board-ark";
          break;
        case "Send":
          path = screenParams?.destination
            ? `/(tabs)/(home)/send-to?destination=${encodeURIComponent(String(screenParams.destination))}`
            : "/(tabs)/(home)/send-to";
          break;
        case "Transactions":
          path = "/(tabs)/(home)/transactions";
          break;
        case "TransactionDetail":
          if (screenParams?.transaction) {
            path = `/(tabs)/(home)/transaction-detail?transaction=${encodeURIComponent(JSON.stringify(screenParams.transaction))}`;
          } else {
            path = "/(tabs)/(home)/transaction-detail";
          }
          break;
        case "BoardingTransactions":
          path = "/(tabs)/(home)/boarding-transactions";
          break;
        case "BoardingTransactionDetail":
          if (screenParams?.transaction) {
            path = `/(tabs)/(home)/boarding-transaction-detail?transaction=${encodeURIComponent(JSON.stringify(screenParams.transaction))}`;
          } else {
            path = "/(tabs)/(home)/boarding-transaction-detail";
          }
          break;

        // Settings Stack screens
        case "SettingsList":
        case "Settings":
          path = "/(tabs)/settings";
          break;
        case "Mnemonic":
          path = screenParams?.fromOnboarding
            ? `/(onboarding)/mnemonic?fromOnboarding=${screenParams.fromOnboarding}`
            : "/(tabs)/settings/mnemonic";
          break;
        case "Logs":
          path = "/(tabs)/settings/logs";
          break;
        case "LightningAddress":
          if (pathname.includes("onboarding") || screenParams?.fromOnboarding) {
            path = `/(onboarding)/lightning-address?fromOnboarding=${screenParams?.fromOnboarding}`;
          } else {
            path = "/(tabs)/settings/lightning-address";
          }
          break;
        case "BackupSettings":
          path = "/(tabs)/settings/backup-settings";
          break;
        case "VTXOs":
          path = "/(tabs)/settings/vtxos";
          break;
        case "VTXODetail":
          if (screenParams?.vtxo) {
            path = `/(tabs)/settings/vtxo-detail?vtxo=${encodeURIComponent(JSON.stringify(screenParams.vtxo))}`;
          } else {
            path = "/(tabs)/settings/vtxo-detail";
          }
          break;

        // Onboarding screens
        case "Onboarding":
          path = "/(onboarding)";
          break;
        case "Configuration":
          path = "/(onboarding)/configuration";
          break;
        case "RestoreWallet":
          path = "/(onboarding)/restore-wallet";
          break;

        // Tab screens
        case "Receive":
        case "ReceiveStack":
          path = "/(tabs)/receive";
          break;
        case "SendStack":
          path = "/(tabs)/send";
          break;

        default:
          console.warn(`Unknown screen: ${screen}`);
          return;
      }

      router.push(path);
    },
    [router, pathname],
  );

  const push = useCallback(
    (screen: string, screenParams?: NavigationParams) => {
      navigate(screen, screenParams);
    },
    [navigate],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/(home)");
    }
  }, [router]);

  const replace = useCallback(
    (screen: string, screenParams?: NavigationParams) => {
      let path = "";

      // Use same mapping as navigate but with replace
      switch (screen) {
        case "HomeStack":
        case "Home":
          path = "/(tabs)/(home)";
          break;
        case "(tabs)":
          path = "/(tabs)/(home)";
          break;
        default:
          // Fallback to navigate for other screens
          navigate(screen, screenParams);
          return;
      }

      router.replace(path);
    },
    [router, navigate],
  );

  // Helper to get params from search params
  const getParams = useCallback(() => {
    const searchParams: NavigationParams = {};

    // Parse complex params that were JSON stringified
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (typeof value === "string") {
        try {
          // Try to parse JSON if it looks like it might be JSON
          if (value.startsWith("{") || value.startsWith("[")) {
            searchParams[key] = JSON.parse(value);
          } else {
            searchParams[key] = value;
          }
        } catch {
          searchParams[key] = value;
        }
      } else {
        searchParams[key] = value;
      }
    });

    return searchParams;
  }, [params]);

  return {
    navigate,
    push,
    goBack,
    replace,
    params: getParams(),
    pathname,
  };
}

// Export a type for components that expect navigation prop
export type AppNavigationProp = ReturnType<typeof useAppNavigation>;
