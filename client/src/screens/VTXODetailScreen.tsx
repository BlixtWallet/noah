import { View, Pressable, ScrollView } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { copyToClipboard } from "../lib/clipboardUtils";
import { useState } from "react";
import { COLORS } from "~/lib/styleConstants";
import type { BarkVtxo } from "~/hooks/useWallet";
import { useGetBlockHeight } from "~/hooks/useMarketData";

type VTXOWithStatus = BarkVtxo & {
  isExpiring: boolean;
};

const VTXODetailRow = ({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await copyToClipboard(value, {
      onCopy: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      },
    });
  };

  return (
    <View className="flex-row justify-between items-center py-3 border-b border-border/10 last:border-b-0">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      {copyable ? (
        <Pressable onPress={onCopy} className="flex-row items-center gap-x-2 flex-shrink-0">
          <Text
            className="text-foreground text-sm text-right"
            ellipsizeMode="middle"
            numberOfLines={1}
            style={{ maxWidth: 150 }}
          >
            {value}
          </Text>
          {copied ? (
            <Icon name="checkmark-circle-outline" size={16} color={COLORS.SUCCESS} />
          ) : (
            <Icon name="copy-outline" size={16} color="white" />
          )}
        </Pressable>
      ) : (
        <Text
          className="text-foreground text-sm text-right"
          ellipsizeMode="tail"
          numberOfLines={2}
          style={{ maxWidth: 200 }}
        >
          {value}
        </Text>
      )}
    </View>
  );
};

const VTXODetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { data: blockHeight, isError: isErrorFetchingBlockHeight } = useGetBlockHeight();
  const { vtxo } = route.params as { vtxo: VTXOWithStatus };

  const formatAmount = (amount: number) => {
    return (amount / 100000000).toFixed(8); // Convert sats to BTC
  };

  const getStatusColor = (isExpiring: boolean) => {
    return isExpiring ? "text-orange-500" : "text-green-500";
  };

  const getStatusIcon = (isExpiring: boolean) => {
    return isExpiring ? "warning-outline" : "checkmark-circle-outline";
  };

  const getVtxoIcon = (isExpiring: boolean) => {
    return isExpiring ? "warning-outline" : "cube-outline";
  };

  const getVtxoColor = (isExpiring: boolean) => {
    return isExpiring ? "#f97316" : "#22c55e";
  };

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <View className="p-4 flex-1">
        <View className="flex-row items-center mb-8">
          <Pressable onPress={() => navigation.goBack()} className="mr-4">
            <Icon name="arrow-back-outline" size={24} color="white" />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">VTXO Details</Text>
        </View>

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 50 }}
        >
          <View className="items-center my-8">
            <View className="mb-4">
              <Icon
                name={getVtxoIcon(vtxo.isExpiring)}
                size={64}
                color={getVtxoColor(vtxo.isExpiring)}
              />
            </View>
            <Text className="text-3xl font-bold text-foreground mb-2">
              {formatAmount(vtxo.amount)} BTC
            </Text>
            <View className="flex-row items-center">
              <Icon
                name={getStatusIcon(vtxo.isExpiring)}
                size={20}
                color={vtxo.isExpiring ? "#f97316" : "#22c55e"}
              />
              <Text className={`text-xl font-medium ml-2 ${getStatusColor(vtxo.isExpiring)}`}>
                {vtxo.isExpiring ? "Expiring" : "Active"}
              </Text>
            </View>
          </View>

          <View className="bg-card p-4 rounded-lg mb-4">
            <VTXODetailRow
              label="Amount"
              value={`${formatAmount(vtxo.amount)} BTC (${vtxo.amount.toLocaleString()} sats)`}
            />
            <VTXODetailRow label="Status" value={vtxo.isExpiring ? "Expiring" : "Active"} />
            <VTXODetailRow
              label="Current Block Height"
              value={blockHeight ? blockHeight.toLocaleString() : "Loading..."}
            />
            <VTXODetailRow label="Expiry Height" value={vtxo.expiry_height.toLocaleString()} />
            <VTXODetailRow
              label="Blocks Until Expiry"
              value={
                blockHeight
                  ? vtxo.expiry_height > blockHeight
                    ? `${(vtxo.expiry_height - blockHeight).toLocaleString()}`
                    : "Expired"
                  : "Loading..."
              }
            />
            <VTXODetailRow label="Exit Delta" value={vtxo.exit_delta.toString()} />
          </View>

          <View className="bg-card p-4 rounded-lg mb-4">
            <Text className="text-foreground text-lg font-semibold mb-3">Vtxo Details</Text>
            <VTXODetailRow label="Point" value={vtxo.point} copyable />
            <VTXODetailRow label="Anchor Point" value={vtxo.anchor_point} copyable />
            <VTXODetailRow label="Server Public Key" value={vtxo.server_pubkey} copyable />
          </View>
        </ScrollView>
      </View>
    </NoahSafeAreaView>
  );
};

export default VTXODetailScreen;
