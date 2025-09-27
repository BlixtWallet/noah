import React from "react";
import { NativeTabs, Icon, Label, VectorIcon } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="(home)">
        <Label>Home</Label>
        {Platform.select({
          ios: <Icon sf={{ default: "house", selected: "house.fill" }} />,
          android: (
            <Icon
              src={{
                default: <VectorIcon family={Ionicons} name="home-outline" />,
                selected: <VectorIcon family={Ionicons} name="home" />,
              }}
            />
          ),
        })}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="receive">
        <Label>Receive</Label>
        {Platform.select({
          ios: (
            <Icon sf={{ default: "arrow.down.left", selected: "arrow.down.left.circle.fill" }} />
          ),
          android: (
            <Icon
              src={{
                default: <VectorIcon family={Ionicons} name="arrow-down-outline" />,
                selected: <VectorIcon family={Ionicons} name="arrow-down" />,
              }}
            />
          ),
        })}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="send">
        <Label>Send</Label>
        {Platform.select({
          ios: <Icon sf={{ default: "arrow.up.right", selected: "arrow.up.right.circle.fill" }} />,
          android: (
            <Icon
              src={{
                default: <VectorIcon family={Ionicons} name="arrow-up-outline" />,
                selected: <VectorIcon family={Ionicons} name="arrow-up" />,
              }}
            />
          ),
        })}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <Label>Settings</Label>
        {Platform.select({
          ios: <Icon sf={{ default: "gear", selected: "gearshape.fill" }} />,
          android: (
            <Icon
              src={{
                default: <VectorIcon family={Ionicons} name="settings-outline" />,
                selected: <VectorIcon family={Ionicons} name="settings" />,
              }}
            />
          ),
        })}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
