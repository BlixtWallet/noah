import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import EditSettingScreen from "./src/screens/EditSettingScreen";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform, StatusBar } from "react-native";
import { useWalletStore } from "./src/store/walletStore";
import { COLORS } from "./src/lib/constants";
import React from "react";
export type SettingsStackParamList = {
  SettingsList: undefined;
  EditSetting: { item: { id: string; title: string; value?: string } };
};

const Tab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator<SettingsStackParamList>();
const HomeStack = createNativeStackNavigator();

const queryClient = new QueryClient();

const SettingsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SettingsList" component={SettingsScreen} />
    <Stack.Screen name="EditSetting" component={EditSettingScreen} />
  </Stack.Navigator>
);

const HomeStackScreen = () => (
  <HomeStack.Navigator>
    <HomeStack.Screen name="HomeStack" component={HomeScreen} options={{ headerShown: false }} />
  </HomeStack.Navigator>
);

const AppContent = () => {
  const isInitialized = useWalletStore((state) => state.isInitialized);
  const isIos = Platform.OS === "ios";

  if (!isInitialized) {
    return <OnboardingScreen />;
  }

  return (
    <Tab.Navigator
      tabBarStyle={{
        backgroundColor: COLORS.TAB_BAR_BACKGROUND,
      }}
      tabBarInactiveTintColor={COLORS.TAB_BAR_INACTIVE}
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
          <StatusBar barStyle="light-content" />
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
