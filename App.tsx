import "./global.css";

import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";
import Icon from "@react-native-vector-icons/ionicons";
import { Platform } from "react-native";

const Tab = createNativeBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator>
          <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{
              tabBarIcon: () => {
                return Platform.OS === "ios"
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
                return Platform.OS === "ios"
                  ? { sfSymbol: "gear" }
                  : Icon.getImageSourceSync("settings", 24)!;
              },
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
