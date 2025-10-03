import React, { useState, useEffect } from "react";
import { View, Pressable, TextInput, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "@react-native-vector-icons/ionicons";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { getAppLogs } from "noah-tools";
import { COLORS } from "~/lib/styleConstants";
import { Button } from "~/components/ui/button";
import { NoahActivityIndicator } from "../components/ui/NoahActivityIndicator";
import { useBottomTabBarHeight } from "react-native-bottom-tabs";
import RNFSTurbo from "react-native-fs-turbo";
import Share from "react-native-share";
import { CACHES_DIRECTORY_PATH, PLATFORM } from "~/constants";
import { Result, ResultAsync } from "neverthrow";
import logger from "~/lib/log";

const log = logger("LogScreen");

const LogScreen = () => {
  const navigation = useNavigation();
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomTabBarHeight = useBottomTabBarHeight();

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
      log.e("Error writing log file:", [writeFileResult.error]);
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
        log.e("Error sharing Logs:", [shareResult.error]);
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
            <NoahActivityIndicator size="large" />
          </View>
        ) : error ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-destructive text-center">{error}</Text>
          </View>
        ) : (
          <View className="flex-1 bg-card rounded-lg p-2">
            {logs.length > 0 ? (
              <ScrollView
                contentContainerStyle={{ paddingBottom: bottomTabBarHeight }}
                showsVerticalScrollIndicator={true}
              >
                {PLATFORM === "ios" ? (
                  <TextInput
                    editable={false}
                    multiline
                    value={logs.join("\n\n")}
                    className="text-sm text-white font-mono p-2"
                    selectionColor={COLORS.BITCOIN_ORANGE}
                  />
                ) : (
                  <Text
                    selectable
                    selectionColor={COLORS.BITCOIN_ORANGE}
                    className="text-sm text-white font-mono p-2"
                  >
                    {logs.join("\n\n")}
                  </Text>
                )}
              </ScrollView>
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
