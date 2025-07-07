import React from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";

import HomeScreen from "~/screens/HomeScreen";
import OnboardingScreen from "~/screens/OnboardingScreen";
import ReceiveScreen from "~/screens/ReceiveScreen";
import SendScreen from "~/screens/SendScreen";
import SettingsScreen from "~/screens/SettingsScreen";
import EditSettingScreen from "~/screens/EditSettingScreen";
import BoardArkScreen from "~/screens/BoardArkScreen";
import MnemonicScreen from "~/screens/MnemonicScreen";
import WalletLoader from "~/components/WalletLoader";
import { useWalletStore } from "~/store/walletStore";
import { COLORS } from "~/lib/constants";
import { PortalHost } from "@rn-primitives/portal";
import AppServices from "~/AppServices";

// Param list types
export type SettingsStackParamList = {
  SettingsList: undefined;
  Mnemonic: { fromOnboarding: boolean };
};

export type OnboardingStackParamList = {
  Onboarding: undefined;
  Configuration: undefined;
  EditConfiguration: { item: { id: string; title: string; value?: string } };
  Mnemonic: { fromOnboarding: boolean };
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

const SettingsStackNav = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SettingsList" component={SettingsScreen} />
    <Stack.Screen name="Mnemonic" component={MnemonicScreen} />
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
    <OnboardingStack.Screen name="Mnemonic" component={MnemonicScreen} />
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
      disablePageAnimations
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
