import React, { useState, useEffect, useRef } from "react";
import { View, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { getAppLogs } from "noah-tools";
import { COLORS } from "~/lib/styleConstants";
import { Button } from "~/components/ui/button";
import { useBottomTabBarHeight } from "react-native-bottom-tabs";
import RNFSTurbo from "react-native-fs-turbo";
import Share from "react-native-share";
import { CACHES_DIRECTORY_PATH, PLATFORM } from "~/constants";
import { Result, ResultAsync } from "neverthrow";

const LogScreen = () => {
  const navigation = useNavigation();
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const flashListRef = useRef<FlashListRef<string>>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      const result = await ResultAsync.fromPromise(getAppLogs(), (e) => e as Error);

      if (isMounted) {
        if (result.isOk()) {
          setLogs(result.value);
        } else {
          setError(result.error.message || "Failed to fetch logs.");
        }
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
        flashListRef.current?.scrollToIndex({
          index: logs.length - 1,
        });
      }, 1000);
    }
  }, [logs, isLoading]);

  const handleShare = async () => {
    const path = `${CACHES_DIRECTORY_PATH}/noah_logs.txt`;
    const url = PLATFORM === "android" ? `file://${path}` : path;

    const writeFileResult = Result.fromThrowable(
      () => {
        return RNFSTurbo.writeFile(path, logs.join("\n"), "utf8");
      },
      (e) => e as Error,
    )();

    if (writeFileResult.isErr()) {
      console.error("Error writing log file:", writeFileResult.error);
      return;
    }

    const options = {
      title: "Share your file",
      message: "Noah App Logs",
      url,
      type: "text/plain",
    };

    const shareResult = await ResultAsync.fromPromise(Share.open(options), (e) => e as Error);

    if (shareResult.isErr()) {
      if (!shareResult.error.message.includes("User did not share")) {
        console.error("Error sharing Logs:", shareResult.error);
      }
    }

    // Clean up: Delete the temporary file after sharing
    Result.fromThrowable(
      () => {
        return RNFSTurbo.unlink(path);
      },
      (e) => e as Error,
    )();
  };

  const renderLogItem = ({ item, index }: { item: string; index: number }) => {
    return (
      <View className="mb-2">
        {PLATFORM === "ios" ? (
          <TextInput
            editable={false}
            multiline
            value={item}
            className="text-sm text-white font-mono"
            selectionColor={COLORS.BITCOIN_ORANGE}
          />
        ) : (
          <Text
            selectable
            selectionColor={COLORS.BITCOIN_ORANGE}
            className="text-sm text-white font-mono"
          >
            {item}
          </Text>
        )}
      </View>
    );
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
          <View className="flex-1 bg-card rounded-lg p-2">
            {logs.length > 0 ? (
              <FlashList
                ref={flashListRef}
                data={logs}
                renderItem={renderLogItem}
                contentContainerStyle={{ paddingBottom: bottomTabBarHeight }}
              />
            ) : (
              <View className="flex-1 justify-center items-center">
                <Text className="text-center text-muted-foreground">No logs found.</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </NoahSafeAreaView>
  );
};

export default LogScreen;
