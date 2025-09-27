import React from "react";
import { Tabs } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { COLORS } from "~/lib/styleConstants";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.TAB_BAR_BACKGROUND,
        },
        tabBarInactiveTintColor: COLORS.TAB_BAR_INACTIVE,
        tabBarActiveTintColor: COLORS.BITCOIN_ORANGE,
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused ? "home" : "home-outline";
            return <Icon name={iconName} size={size} color={color} />;
          },
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: "Receive",
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused ? "arrow-down" : "arrow-down-outline";
            return <Icon name={iconName} size={size} color={color} />;
          },
        }}
      />
      <Tabs.Screen
        name="send"
        options={{
          title: "Send",
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused ? "arrow-up" : "arrow-up-outline";
            return <Icon name={iconName} size={size} color={color} />;
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused ? "settings" : "settings-outline";
            return <Icon name={iconName} size={size} color={color} />;
          },
        }}
      />
    </Tabs>
  );
}
