import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { getAppLogs } from "noah-tools";
import { COLORS } from "~/lib/styleConstants";
import { Button } from "~/components/ui/button";
import { useBottomTabBarHeight } from "react-native-bottom-tabs";
import * as RNFS from "@dr.pogodin/react-native-fs";
import Share from "react-native-share";
import { PLATFORM } from "~/constants";

const LogScreen = () => {
  const navigation = useNavigation();
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      try {
        const appLogs = await getAppLogs();
        if (isMounted) {
          setLogs(appLogs);
        }
      } catch (e: any) {
        if (isMounted) {
          setError(e.message || "Failed to fetch logs.");
        }
      }
      if (isMounted) {
        setIsLoading(false);
      }
    };

    fetchLogs();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoading && logs.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs, isLoading]);

  const handleShare = async () => {
    const path = `${RNFS.CachesDirectoryPath}/noah_logs.txt`;
    const url = PLATFORM === "android" ? `file://${path}` : path;

    try {
      await RNFS.writeFile(path, logs.join("\n"), "utf8");

      console.log("Sharing URL:", url); // Debug log

      const options = {
        title: "Share your file",
        message: "Noah App Logs",
        url,
        type: "text/plain",
      };

      await Share.open(options);

      // Clean up: Delete the temporary file after sharing
      await RNFS.unlink(path);
      console.log("File shared and deleted successfully");
    } catch (error) {
      if (error && typeof error === "object" && "message" in error) {
        const errorMessage = (error as Error).message;
        if (!errorMessage.includes("User did not share")) {
          console.error("Error sharing Logs:", error);
        }
      }
    }
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4 flex-1">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Pressable onPress={() => navigation.goBack()} className="mr-4">
              <Icon name="arrow-back-outline" size={24} color="white" />
            </Pressable>
            <Text className="text-2xl font-bold text-foreground">App Logs</Text>
          </View>
          <Button onPress={handleShare} variant="outline" disabled={logs.length === 0}>
            <Icon name="share-outline" size={20} color="white" />
          </Button>
        </View>
        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={COLORS.BITCOIN_ORANGE} />
          </View>
        ) : error ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-destructive text-center">{error}</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            className="flex-1 bg-card rounded-lg p-2"
            contentContainerStyle={{ paddingBottom: bottomTabBarHeight }}
          >
            {logs.length > 0 ? (
              PLATFORM === "ios" ? (
                <TextInput
                  editable={false}
                  multiline
                  value={logs.join("\n\n")}
                  className="text-sm text-white font-mono"
                  selectionColor={COLORS.BITCOIN_ORANGE}
                />
              ) : (
                <Text
                  selectable
                  selectionColor={COLORS.BITCOIN_ORANGE}
                  className="text-sm text-white font-mono"
                >
                  {logs.join("\n\n")}
                </Text>
              )
            ) : (
              <Text className="text-center text-muted-foreground">No logs found.</Text>
            )}
          </ScrollView>
        )}
      </View>
    </NoahSafeAreaView>
  );
};

export default LogScreen;
