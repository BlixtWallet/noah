import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ParsedBip321 } from "../lib/sendUtils";
import { ArkIcon } from "~/lib/icons/Ark";
import { LightningIcon } from "~/lib/icons/Lightning";
import { OnchainIcon } from "~/lib/icons/Onchain";
import { cn } from "~/lib/utils";

type PaymentMethod = "ark" | "lightning" | "onchain";

type Bip321PickerProps = {
  bip321Data: ParsedBip321;
  selectedPaymentMethod: PaymentMethod;
  onSelect: (type: PaymentMethod) => void;
};

const PaymentOption = ({
  method,
  icon,
  label,
  isSelected,
  onSelect,
}: {
  method: PaymentMethod;
  icon: React.ReactNode;
  label: string;
  isSelected: boolean;
  onSelect: (type: PaymentMethod) => void;
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

export const Bip321Picker = ({
  bip321Data,
  selectedPaymentMethod,
  onSelect,
}: Bip321PickerProps) => {
  return (
    <View className="p-4 bg-card rounded-lg space-y-2">
      <Text className="text-lg font-bold text-foreground mb-2">Select Payment Method</Text>
      {bip321Data.arkAddress && (
        <PaymentOption
          method="ark"
          icon={<ArkIcon className="w-6 h-6 text-primary" />}
          label="Ark"
          isSelected={selectedPaymentMethod === "ark"}
          onSelect={onSelect}
        />
      )}
      {bip321Data.lightningInvoice && (
        <PaymentOption
          method="lightning"
          icon={<LightningIcon className="w-6 h-6 text-primary" />}
          label="Lightning"
          isSelected={selectedPaymentMethod === "lightning"}
          onSelect={onSelect}
        />
      )}
      <PaymentOption
        method="onchain"
        icon={<OnchainIcon className="w-6 h-6 text-primary" />}
        label="On-chain"
        isSelected={selectedPaymentMethod === "onchain"}
        onSelect={onSelect}
      />
    </View>
  );
};
