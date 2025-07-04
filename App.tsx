import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import ReceiveScreen from "./src/screens/ReceiveScreen";
import SendScreen from "./src/screens/SendScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import EditSettingScreen from "./src/screens/EditSettingScreen";
import BoardArkScreen from "./src/screens/BoardArkScreen";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Icon from "@react-native-vector-icons/ionicons";
import { ActivityIndicator, Platform, View, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useWalletStore } from "./src/store/walletStore";
import { COLORS } from "./src/lib/constants";
import React, { useEffect } from "react";
import { PortalHost } from "@rn-primitives/portal";
import { useLoadWallet, useCloseWallet } from "./src/hooks/useWallet";
import { AlertProvider } from "./src/contexts/AlertProvider";

export type SettingsStackParamList = {
  SettingsList: undefined;
};

export type OnboardingStackParamList = {
  Onboarding: undefined;
  Configuration: undefined;
  EditConfiguration: { item: { id: string; title: string; value?: string } };
};

export type HomeStackParamList = {
  HomeStack: undefined;
  BoardArk: undefined;
};

const Tab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator<SettingsStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ReceiveStack = createNativeStackNavigator();
const SendStack = createNativeStackNavigator();

const queryClient = new QueryClient();

const SettingsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SettingsList" component={SettingsScreen} />
  </Stack.Navigator>
);

const HomeStackScreen = () => (
  <HomeStack.Navigator>
    <HomeStack.Screen name="HomeStack" component={HomeScreen} options={{ headerShown: false }} />
    <HomeStack.Screen name="BoardArk" component={BoardArkScreen} options={{ headerShown: false }} />
  </HomeStack.Navigator>
);

const ReceiveStackScreen = () => (
  <ReceiveStack.Navigator>
    <ReceiveStack.Screen
      name="ReceiveStack"
      component={ReceiveScreen}
      options={{ headerShown: false }}
    />
  </ReceiveStack.Navigator>
);

const SendStackScreen = () => (
  <SendStack.Navigator>
    <SendStack.Screen name="SendStack" component={SendScreen} options={{ headerShown: false }} />
  </SendStack.Navigator>
);

const OnboardingStackScreen = () => (
  <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
    <OnboardingStack.Screen name="Onboarding" component={OnboardingScreen} />
    <OnboardingStack.Screen name="Configuration" component={SettingsScreen} />
    <OnboardingStack.Screen name="EditConfiguration" component={EditSettingScreen} />
  </OnboardingStack.Navigator>
);

const AppContent = () => {
  const { isInitialized, isWalletLoaded, setWalletLoaded } = useWalletStore();
  const { mutate: loadWallet, isPending: isWalletLoading, isSuccess } = useLoadWallet();
  const { mutate: closeWallet } = useCloseWallet();
  const isIos = Platform.OS === "ios";

  console.log("wallet loaded", isInitialized, isWalletLoaded);

  useEffect(() => {
    if (isInitialized && !isWalletLoaded) {
      loadWallet();
    }
  }, [isInitialized, isWalletLoaded, loadWallet]);

  useEffect(() => {
    if (isSuccess) {
      setWalletLoaded();
    }
  }, [isSuccess, setWalletLoaded]);

  // Cleanup: close wallet when AppContent unmounts
  useEffect(() => {
    return () => {
      if (isWalletLoaded) {
        console.log("Closing wallet");
        closeWallet();
      }
    };
  }, [isWalletLoaded, closeWallet]);

  if (!isInitialized) {
    return <OnboardingStackScreen />;
  }

  if (isWalletLoading || !isWalletLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
        <Text style={{ marginTop: 10, color: "white" }}>Loading Wallet...</Text>
      </View>
    );
  }

  return (
    <Tab.Navigator
      tabBarStyle={{
        backgroundColor: COLORS.TAB_BAR_BACKGROUND,
      }}
      tabBarInactiveTintColor={COLORS.TAB_BAR_INACTIVE}
      disablePageAnimations={true}
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
        component={SettingsStack}
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer theme={DarkTheme}>
          <StatusBar style="light" />
          <AppContent />
          <PortalHost />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
