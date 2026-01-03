import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, AppState, AppStateStatus } from "react-native";
import { Text } from "./ui/text";
import { NoahButton } from "./ui/NoahButton";
import { useBiometrics } from "../hooks/useBiometrics";
import Icon from "@react-native-vector-icons/ionicons";
import { useIconColor } from "../hooks/useTheme";
import logger from "../lib/log";

const log = logger("BiometricGate");

interface BiometricGateProps {
  children: React.ReactNode;
}

const BiometricGate: React.FC<BiometricGateProps> = ({ children }) => {
  const { authenticate, isBiometricsEnabled } = useBiometrics();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [hasCheckedInitial, setHasCheckedInitial] = useState(false);
  const isAuthenticatingRef = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const iconColor = useIconColor();

  const performAuth = useCallback(async () => {
    if (isAuthenticatingRef.current) return;

    isAuthenticatingRef.current = true;
    setIsAuthenticating(true);

    const result = await authenticate("Authenticate to unlock Noah");

    isAuthenticatingRef.current = false;
    setIsAuthenticating(false);

    if (result.isOk()) {
      setIsAuthenticated(true);
    } else {
      log.w("Biometric authentication failed", [result.error]);
      setIsAuthenticated(false);
    }
  }, [authenticate]);

  // Initial check - either authenticate or mark as authenticated if biometrics disabled
  useEffect(() => {
    if (hasCheckedInitial) return;

    if (isBiometricsEnabled) {
      setHasCheckedInitial(true);
      performAuth();
    } else {
      // Biometrics is disabled, allow access
      setHasCheckedInitial(true);
      setIsAuthenticated(true);
    }
  }, [isBiometricsEnabled, hasCheckedInitial, performAuth]);

  // Handle biometrics being toggled off while app is running - unlock immediately
  useEffect(() => {
    if (hasCheckedInitial && !isBiometricsEnabled) {
      setIsAuthenticated(true);
    }
  }, [isBiometricsEnabled, hasCheckedInitial]);

  // Handle app state changes - lock when going to background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // Skip state change handling while authenticating - the biometric prompt
      // causes the app to go inactive/background which would cause an infinite loop
      if (isAuthenticatingRef.current) {
        appState.current = nextAppState;
        return;
      }

      const wasActive = appState.current === "active";
      const isNowBackground = nextAppState === "background";
      const isNowActive = nextAppState === "active";
      const wasBackground = appState.current === "background";

      if (wasActive && isNowBackground) {
        // App is going to background - lock it
        if (isBiometricsEnabled) {
          setIsAuthenticated(false);
        }
      } else if (wasBackground && isNowActive) {
        // App is coming to foreground - prompt for auth if needed
        if (isBiometricsEnabled) {
          performAuth();
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isBiometricsEnabled, performAuth]);

  // Show nothing until we've done the initial check (prevents flash of content)
  if (!hasCheckedInitial) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  // If biometrics disabled, just show children
  if (!isBiometricsEnabled) {
    return <>{children}</>;
  }

  // If authenticated, show children
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Show lock screen
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Icon name="lock-closed-outline" size={64} color={iconColor} />
      <Text className="text-2xl font-bold text-foreground mt-6 mb-2">Noah is Locked</Text>
      <Text className="text-muted-foreground text-center mb-8">
        Authenticate to access your wallet
      </Text>
      <NoahButton onPress={performAuth} disabled={isAuthenticating}>
        {isAuthenticating ? "Authenticating..." : "Unlock"}
      </NoahButton>
    </View>
  );
};

export default BiometricGate;
