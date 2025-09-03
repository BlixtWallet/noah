import React, { useEffect, useState } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform, View, ActivityIndicator, Text } from "react-native";
import { StatusBar } from "expo-status-bar";

import HomeScreen from "~/screens/HomeScreen";
import OnboardingScreen from "~/screens/OnboardingScreen";
import ReceiveScreen from "~/screens/ReceiveScreen";
import SendScreen from "~/screens/SendScreen";
import SettingsScreen from "~/screens/SettingsScreen";
import EditSettingScreen from "~/screens/EditSettingScreen";
import BoardArkScreen from "~/screens/BoardArkScreen";
import MnemonicScreen from "~/screens/MnemonicScreen";
import LogScreen from "~/screens/LogScreen";
import TransactionsScreen from "~/screens/TransactionsScreen";
import TransactionDetailScreen from "~/screens/TransactionDetailScreen";
import LightningAddressScreen from "~/screens/LightningAddressScreen";
import { BackupSettingsScreen } from "~/screens/BackupSettingsScreen";
import RestoreWalletScreen from "~/screens/RestoreWalletScreen";
import WalletLoader from "~/components/WalletLoader";
import { useWalletStore } from "~/store/walletStore";
import { COLORS } from "~/lib/styleConstants";
import { PortalHost } from "@rn-primitives/portal";
import AppServices from "~/AppServices";
import { Transaction } from "~/types/transaction";
import { getMnemonic } from "~/lib/crypto";

// Param list types
export type SettingsStackParamList = {
  SettingsList: undefined;
  Mnemonic: { fromOnboarding: boolean };
  Logs: undefined;
  LightningAddress: undefined;
  BackupSettings: undefined;
};

export type OnboardingStackParamList = {
  Onboarding: undefined;
  Configuration: undefined;
  EditConfiguration: { item: { id: string; title: string; value?: string } };
  Mnemonic: { fromOnboarding: boolean };
  RestoreWallet: undefined;
};

export type HomeStackParamList = {
  HomeStack: undefined;
  BoardArk: undefined;
  Send: { destination: string };
  Transactions: undefined;
  TransactionDetail: { transaction: Transaction };
};

const Tab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator<SettingsStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ReceiveStack = createNativeStackNavigator();
const SendStack = createNativeStackNavigator();

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
  </HomeStack.Navigator>
);

const ReceiveStackScreen = () => (
  <ReceiveStack.Navigator>
    <ReceiveStack.Screen
      name="ReceiveStack"
      component={ReceiveScreen}
      options={{ headerShown: false, animation: "default" }}
    />
  </ReceiveStack.Navigator>
);

const SendStackScreen = () => (
  <SendStack.Navigator>
    <SendStack.Screen
      name="SendStack"
      component={SendScreen}
      options={{ headerShown: false, animation: "default" }}
    />
  </SendStack.Navigator>
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
      name="EditConfiguration"
      component={EditSettingScreen}
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
  </OnboardingStack.Navigator>
);

const AppTabs = () => {
  const isIos = Platform.OS === "ios";

  return (
    <Tab.Navigator
      tabBarStyle={{
        backgroundColor: COLORS.TAB_BAR_BACKGROUND,
      }}
      tabBarInactiveTintColor={COLORS.TAB_BAR_INACTIVE}
      hapticFeedbackEnabled
      screenOptions={{
        tabBarActiveTintColor: COLORS.BITCOIN_ORANGE,
      }}
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
      />
      <Tab.Screen
        name="Receive"
        component={ReceiveStackScreen}
        options={{
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
        component={SendStackScreen}
        options={{
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
          tabBarIcon: ({ focused }) => {
            if (isIos) {
              return { sfSymbol: focused ? "gearshape.fill" : "gear" };
            }
            const iconName = focused ? "settings" : "settings-outline";
            return Icon.getImageSourceSync(iconName, 24)!;
          },
        }}
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
        console.log("Found existing wallet on app start, initializing...");
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
          <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
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
