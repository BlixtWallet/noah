import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer, DefaultTheme, Theme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform, StatusBar } from "react-native";
import { useWalletStore } from "./src/store/walletStore";

const Tab = createNativeBottomTabNavigator();

const queryClient = new QueryClient();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#000000",
    card: "#000000",
    text: "#FFFFFF",
  },
};

const AppContent = () => {
  const isInitialized = useWalletStore((state) => state.isInitialized);
  const isIos = Platform.OS === "ios";

  if (!isInitialized) {
    return <OnboardingScreen />;
  }

  return (
    <Tab.Navigator
      tabBarStyle={{
        backgroundColor: "#1C1C1E",
      }}
      tabBarInactiveTintColor="#8e8e93"
      screenOptions={{
        tabBarActiveTintColor: "#c98a3c",
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
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
        component={SettingsScreen}
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
        <NavigationContainer theme={navTheme}>
          <StatusBar barStyle="light-content" />
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
