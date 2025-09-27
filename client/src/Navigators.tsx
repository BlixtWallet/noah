import React, { useEffect, useState } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform, View, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NoahActivityIndicator } from "~/components/ui/NoahActivityIndicator";

import HomeScreen from "~/screens/HomeScreen";
import OnboardingScreen from "~/screens/OnboardingScreen";
import ReceiveScreen from "~/screens/ReceiveScreen";
import SendScreen from "~/screens/SendScreen";
import SettingsScreen from "~/screens/SettingsScreen";
import BoardArkScreen from "~/screens/BoardArkScreen";
import MnemonicScreen from "~/screens/MnemonicScreen";
import LogScreen from "~/screens/LogScreen";
import TransactionsScreen from "~/screens/TransactionsScreen";
import TransactionDetailScreen from "~/screens/TransactionDetailScreen";
import BoardingTransactionsScreen from "~/screens/BoardingTransactionsScreen";
import BoardingTransactionDetailScreen from "~/screens/BoardingTransactionDetailScreen";
import LightningAddressScreen from "~/screens/LightningAddressScreen";
import { BackupSettingsScreen } from "~/screens/BackupSettingsScreen";
import RestoreWalletScreen from "~/screens/RestoreWalletScreen";
import WalletLoader from "~/components/WalletLoader";
import { useWalletStore } from "~/store/walletStore";
import { COLORS } from "~/lib/styleConstants";
import { PortalHost } from "@rn-primitives/portal";
import AppServices from "~/AppServices";
import { Transaction } from "~/types/transaction";
import { OnboardingRequest, OffboardingRequest } from "~/lib/transactionsDb";
import { getMnemonic } from "~/lib/crypto";
import VTXOsScreen, { type VTXOWithStatus } from "~/screens/VTXOsScreen";
import VTXODetailScreen from "~/screens/VTXODetailScreen";

// Param list types
type BoardingTransaction = (OnboardingRequest | OffboardingRequest) & {
  type: "onboarding" | "offboarding";
};
export type TabParamList = {
  Home: undefined;
  Receive: undefined;
  Send: { destination?: string };
  Settings: undefined;
};

export type SettingsStackParamList = {
  SettingsList: undefined;
  Mnemonic: { fromOnboarding: boolean };
  Logs: undefined;
  LightningAddress: { fromOnboarding?: boolean };
  BackupSettings: undefined;
  VTXOs: undefined;
  VTXODetail: { vtxo: VTXOWithStatus };
};

export type OnboardingStackParamList = {
  Onboarding: undefined;
  Configuration: undefined;
  Mnemonic: { fromOnboarding: boolean };
  RestoreWallet: undefined;
  LightningAddress: { fromOnboarding: boolean };
};

export type HomeStackParamList = {
  HomeStack: undefined;
  BoardArk: undefined;
  Send: { destination: string };
  Transactions: undefined;
  TransactionDetail: { transaction: Transaction };
  BoardingTransactions: undefined;
  BoardingTransactionDetail: { transaction: BoardingTransaction };
};

const Tab = createNativeBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<SettingsStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

const SettingsStackNav = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen
      name="SettingsList"
      component={SettingsScreen}
      options={{ animation: "default" }}
    />
    <Stack.Screen name="Mnemonic" component={MnemonicScreen} options={{ animation: "default" }} />
    <Stack.Screen name="Logs" component={LogScreen} options={{ animation: "default" }} />
    <Stack.Screen
      name="LightningAddress"
      component={LightningAddressScreen}
      options={{ animation: "default" }}
    />
    <Stack.Screen
      name="BackupSettings"
      component={BackupSettingsScreen}
      options={{ animation: "default" }}
    />
    <Stack.Screen name="VTXOs" component={VTXOsScreen} options={{ animation: "default" }} />
    <Stack.Screen
      name="VTXODetail"
      component={VTXODetailScreen}
      options={{ animation: "default" }}
    />
  </Stack.Navigator>
);

const HomeStackScreen = () => (
  <HomeStack.Navigator>
    <HomeStack.Screen
      name="HomeStack"
      component={HomeScreen}
      options={{ headerShown: false, animation: "default" }}
    />
    <HomeStack.Screen
      name="BoardArk"
      component={BoardArkScreen}
      options={{ headerShown: false, animation: "default" }}
    />
    <HomeStack.Screen
      name="Send"
      component={SendScreen}
      options={{ headerShown: false, animation: "default" }}
    />
    <HomeStack.Screen
      name="Transactions"
      component={TransactionsScreen}
      options={{ headerShown: false, animation: "default" }}
    />
    <HomeStack.Screen
      name="TransactionDetail"
      component={TransactionDetailScreen}
      options={{ headerShown: false, animation: "default" }}
    />
    <HomeStack.Screen
      name="BoardingTransactions"
      component={BoardingTransactionsScreen}
      options={{ headerShown: false, animation: "default" }}
    />
    <HomeStack.Screen
      name="BoardingTransactionDetail"
      component={BoardingTransactionDetailScreen}
      options={{ headerShown: false, animation: "default" }}
    />
  </HomeStack.Navigator>
);

const OnboardingStackScreen = () => (
  <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
    <OnboardingStack.Screen
      name="Onboarding"
      component={OnboardingScreen}
      options={{ animation: "default" }}
    />
    <OnboardingStack.Screen
      name="Configuration"
      component={SettingsScreen}
      options={{ animation: "default" }}
    />
    <OnboardingStack.Screen
      name="Mnemonic"
      component={MnemonicScreen}
      options={{ animation: "default" }}
    />
    <OnboardingStack.Screen
      name="RestoreWallet"
      component={RestoreWalletScreen}
      options={{ animation: "default" }}
    />
    <OnboardingStack.Screen
      name="LightningAddress"
      component={LightningAddressScreen}
      options={{ animation: "default" }}
    />
  </OnboardingStack.Navigator>
);

const AppTabs = () => {
  const isIos = Platform.OS === "ios";

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.BITCOIN_ORANGE,
      }}
      tabBarStyle={{
        backgroundColor: COLORS.TAB_BAR_BACKGROUND,
      }}
      tabBarInactiveTintColor={COLORS.TAB_BAR_INACTIVE}
      hapticFeedbackEnabled
      disablePageAnimations={true}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackScreen}
        options={{
          tabBarIcon: ({ focused }) => {
            if (isIos) {
              return { sfSymbol: focused ? "house.fill" : "house" };
            }
            const iconName = focused ? "home" : "home-outline";
            return Icon.getImageSourceSync(iconName, 24)!;
          },
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const route = state.routes[state.index];

            // If we're on the Home tab and in a nested screen, prevent default and reset
            if (route.name === "Home" && route.state?.index && route.state.index > 0) {
              // Prevent default action only when we need to reset
              e.preventDefault();

              // Navigate to Home twice to reset the stack
              navigation.navigate("Home");
              // Request animation frame to ensure smooth reset
              requestAnimationFrame(() => {
                navigation.navigate("Home");
              });
            }
            // Otherwise, let the default behavior handle the navigation
          },
        })}
      />
      <Tab.Screen
        name="Receive"
        component={ReceiveScreen}
        options={{
          lazy: true,
          tabBarIcon: ({ focused }) => {
            if (isIos) {
              return { sfSymbol: focused ? "arrow.down.left" : "arrow.down.left" };
            }
            const iconName = focused ? "arrow-down" : "arrow-down-outline";
            return Icon.getImageSourceSync(iconName, 24)!;
          },
        }}
      />
      <Tab.Screen
        name="Send"
        component={SendScreen}
        options={{
          lazy: true,
          tabBarIcon: ({ focused }) => {
            if (isIos) {
              return { sfSymbol: focused ? "arrow.up.right" : "arrow.up.right" };
            }
            const iconName = focused ? "arrow-up" : "arrow-up-outline";
            return Icon.getImageSourceSync(iconName, 24)!;
          },
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStackNav}
        options={{
          lazy: true,
          tabBarIcon: ({ focused }) => {
            if (isIos) {
              return { sfSymbol: focused ? "gearshape.fill" : "gear" };
            }
            const iconName = focused ? "settings" : "settings-outline";
            return Icon.getImageSourceSync(iconName, 24)!;
          },
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const route = state.routes[state.index];

            // If we're on the Settings tab and in a nested screen, prevent default and reset
            if (route.name === "Settings" && route.state?.index && route.state.index > 0) {
              // Prevent default action only when we need to reset
              e.preventDefault();

              // Navigate to Settings twice to reset the stack
              navigation.navigate("Settings");
              // Request animation frame to ensure smooth reset
              requestAnimationFrame(() => {
                navigation.navigate("Settings");
              });
            }
            // Otherwise, let the default behavior handle the navigation
          },
        })}
      />
    </Tab.Navigator>
  );
};

const AppNavigation = () => {
  const { isInitialized } = useWalletStore();
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);

  // Check for existing wallet on app start
  useEffect(() => {
    const checkExistingWallet = async () => {
      if (isInitialized) {
        setIsCheckingWallet(false);
        return; // Already initialized, no need to check
      }

      let shouldCheckWallet = true;
      const mnemonicResult = await getMnemonic();

      if (mnemonicResult.isOk() && mnemonicResult.value) {
        useWalletStore.getState().finishOnboarding();
        shouldCheckWallet = false;
      }

      if (shouldCheckWallet) {
        setIsCheckingWallet(false);
      }
    };

    checkExistingWallet();
  }, [isInitialized]);

  // Show loading screen while checking for existing wallet
  if (isCheckingWallet) {
    return (
      <NavigationContainer theme={DarkTheme}>
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center bg-background">
          <NoahActivityIndicator size="large" />
          <Text style={{ marginTop: 10, color: "white" }}>Loading...</Text>
        </View>
        <PortalHost />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar style="light" />
      {isInitialized ? (
        <WalletLoader>
          <AppServices />
          <AppTabs />
        </WalletLoader>
      ) : (
        <OnboardingStackScreen />
      )}
      <PortalHost />
    </NavigationContainer>
  );
};

export default AppNavigation;
