import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform } from "react-native";
import { useWalletStore } from "./src/store/walletStore";

const Tab = createNativeBottomTabNavigator();

const queryClient = new QueryClient();

const AppContent = () => {
  const isInitialized = useWalletStore((state) => state.isInitialized);
  const isIos = Platform.OS === "ios";

  if (!isInitialized) {
    return <OnboardingScreen />;
  }

  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: () => {
            return isIos
              ? { sfSymbol: "book" }
              : Icon.getImageSourceSync("home", 24)!;
          },
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: () => {
            return isIos
              ? { sfSymbol: "gear" }
              : Icon.getImageSourceSync("settings", 24)!;
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
        <NavigationContainer>
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
