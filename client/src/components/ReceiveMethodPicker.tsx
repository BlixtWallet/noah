import React from "react";
import { View, TouchableOpacity } from "react-native";
import { ArkIcon } from "~/lib/icons/Ark";
import { LightningIcon } from "~/lib/icons/Lightning";
import { OnchainIcon } from "~/lib/icons/Onchain";
import { cn } from "~/lib/utils";
import { Text } from "./ui/text";

export type ReceiveMethod = "ark" | "lightning" | "onchain" | "bip321";

type ReceiveMethodPickerProps = {
  selectedMethod: ReceiveMethod;
  onSelect: (method: ReceiveMethod) => void;
};

const MethodOption = ({
  method,
  icon,
  label,
  isSelected,
  onSelect,
}: {
  method: ReceiveMethod;
  icon: React.ReactNode;
  label: string;
  isSelected: boolean;
  onSelect: (method: ReceiveMethod) => void;
}) => {
  return (
    <TouchableOpacity
      onPress={() => onSelect(method)}
      className={cn(
        "flex-row items-center p-4 rounded-lg border",
        isSelected ? "bg-primary/10 border-primary" : "border-transparent",
      )}
    >
      {icon}
      <Text
        className={cn("text-lg ml-4", isSelected ? "text-primary font-bold" : "text-foreground")}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export const ReceiveMethodPicker = ({ selectedMethod, onSelect }: ReceiveMethodPickerProps) => {
  return (
    <View className="p-4 bg-card rounded-lg space-y-2">
      <Text className="text-lg font-bold text-foreground mb-2">Select Generation Method</Text>
      <MethodOption
        method="bip321"
        icon={<View className="w-6 h-6 bg-primary rounded-full" />}
        label="BIP-321"
        isSelected={selectedMethod === "bip321"}
        onSelect={onSelect}
      />
      <MethodOption
        method="ark"
        icon={<ArkIcon className="w-6 h-6 text-primary" />}
        label="Ark"
        isSelected={selectedMethod === "ark"}
        onSelect={onSelect}
      />
      <MethodOption
        method="lightning"
        icon={<LightningIcon className="w-6 h-6 text-primary" />}
        label="Lightning"
        isSelected={selectedMethod === "lightning"}
        onSelect={onSelect}
      />
      <MethodOption
        method="onchain"
        icon={<OnchainIcon className="w-6 h-6 text-primary" />}
        label="On-chain"
        isSelected={selectedMethod === "onchain"}
        onSelect={onSelect}
      />
    </View>
  );
};
