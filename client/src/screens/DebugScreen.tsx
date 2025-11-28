import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "../Navigators";
import Icon from "@react-native-vector-icons/ionicons";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { Text } from "~/components/ui/text";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { maintanance, maintenanceRefresh } from "~/lib/walletApi";
import { offboardAllArk } from "~/lib/paymentsApi";
import { useAlert } from "~/contexts/AlertProvider";
import logger from "~/lib/log";
import { NoahButton } from "~/components/ui/NoahButton";
import { copyToClipboard } from "~/lib/clipboardUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "~/components/ui/select";

const log = logger("DebugScreen");

type DebugAction = "maintenance" | "maintenanceRefresh" | "offboardAll";

interface ActionOption {
  id: DebugAction;
  title: string;
  description: string;
  requiresInput?: boolean;
  inputPlaceholder?: string;
}

const DEBUG_ACTIONS: ActionOption[] = [
  {
    id: "maintenance",
    title: "Maintenance",
    description: "Run maintenance to refresh expiring VTXOs",
  },
  {
    id: "maintenanceRefresh",
    title: "Maintenance Refresh",
    description: "Run maintenance refresh operation",
  },
  {
    id: "offboardAll",
    title: "Offboard All",
    description: "Offboard all funds to an on-chain address",
    requiresInput: true,
    inputPlaceholder: "Enter Bitcoin address",
  },
];

const DebugScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { showAlert } = useAlert();
  const [selectedOption, setSelectedOption] = useState<Option | undefined>(undefined);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedAction = selectedOption?.value as DebugAction | undefined;
  const selectedActionConfig = DEBUG_ACTIONS.find((a) => a.id === selectedAction);

  type ActionResult = { success: true; message: string } | { success: false; error: string };

  const executeAction = async (action: DebugAction, input: string): Promise<ActionResult> => {
    switch (action) {
      case "maintenance": {
        log.d("Executing maintenance");
        const result = await maintanance();
        if (result.isErr()) {
          return { success: false, error: result.error.message };
        }
        return { success: true, message: "Maintenance completed successfully" };
      }
      case "maintenanceRefresh": {
        log.d("Executing maintenance refresh");
        const result = await maintenanceRefresh();
        if (result.isErr()) {
          return { success: false, error: result.error.message };
        }
        return { success: true, message: "Maintenance refresh completed successfully" };
      }
      case "offboardAll": {
        log.d("Executing offboard all to address:", [input]);
        const result = await offboardAllArk(input.trim());
        if (result.isErr()) {
          return { success: false, error: result.error.message };
        }
        const statusStr =
          typeof result.value === "object"
            ? JSON.stringify(result.value, null, 2)
            : String(result.value);
        return { success: true, message: `Offboard completed.\n\nRound status:\n${statusStr}` };
      }
    }
  };

  const handleExecute = async () => {
    if (!selectedAction) {
      showAlert({ title: "Error", description: "Please select an action" });
      return;
    }

    if (selectedActionConfig?.requiresInput && !inputValue.trim()) {
      showAlert({ title: "Error", description: "Please enter the required input" });
      return;
    }

    setIsLoading(true);
    setResultMessage(null);

    const result = await executeAction(selectedAction, inputValue);

    setIsLoading(false);

    if (result.success) {
      setResultMessage(result.message);
      if (selectedAction === "offboardAll") {
        setInputValue("");
      }
    } else {
      log.e("Debug action failed:", [result.error]);
      showAlert({ title: "Action Failed", description: result.error });
    }
  };

  const handleSelectChange = (option: Option | undefined) => {
    setSelectedOption(option);
    setResultMessage(null);
    setInputValue("");
    setCopied(false);
  };

  const handleCopyResult = async () => {
    if (resultMessage) {
      await copyToClipboard(resultMessage, {
        onCopy: () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
      });
    }
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pb-4">
        <Pressable onPress={() => navigation.goBack()} className="mr-4">
          <Icon name="arrow-back" size={24} color="white" />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Debug</Text>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="mb-6 mt-6">
          <Label className="text-foreground text-2xl mb-2">Select Action</Label>

          <Select value={selectedOption} onValueChange={handleSelectChange}>
            <SelectTrigger className="w-full">
              <SelectValue
                className="text-foreground text-sm native:text-lg"
                placeholder="Choose an action..."
              />
            </SelectTrigger>
            <SelectContent className="w-full">
              {DEBUG_ACTIONS.map((action) => (
                <SelectItem
                  key={action.id}
                  label={action.title}
                  value={action.id}
                  description={action.description}
                />
              ))}
            </SelectContent>
          </Select>
        </View>

        {selectedActionConfig?.requiresInput && (
          <View className="mb-6">
            <Label className="text-foreground text-lg mb-2">
              {selectedActionConfig.inputPlaceholder}
            </Label>
            <Input
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={selectedActionConfig.inputPlaceholder}
              className="h-12"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {resultMessage && (
          <Pressable
            onLongPress={handleCopyResult}
            className="mb-6 p-4 bg-green-900/30 rounded-lg border border-green-700"
          >
            <Text className="text-green-400">{resultMessage}</Text>
            <Text className="text-muted-foreground text-md mt-2">
              {copied ? "Copied!" : "Long press to copy"}
            </Text>
          </Pressable>
        )}

        <NoahButton
          onPress={handleExecute}
          disabled={!selectedAction || isLoading}
          className="mb-6"
        >
          {isLoading ? "Executing..." : "Execute Action"}
        </NoahButton>
      </ScrollView>
    </NoahSafeAreaView>
  );
};

export default DebugScreen;
