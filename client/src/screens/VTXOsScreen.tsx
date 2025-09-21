import { View, Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { Text } from "../components/ui/text";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import Icon from "@react-native-vector-icons/ionicons";
import { Label } from "~/components/ui/label";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "~/Navigators";
import { useGetVtxos, useGetExpiringVtxos, type BarkVtxo } from "~/hooks/useWallet";

export type VTXOWithStatus = BarkVtxo & {
  isExpiring: boolean;
};

const VTXOsScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [filter, setFilter] = useState<"all" | "active" | "expiring">("all");

  const { data: allVtxos = [], isLoading: isLoadingAll } = useGetVtxos();
  const { data: expiringVtxos = [], isLoading: isLoadingExpiring } = useGetExpiringVtxos();

  // Combine and deduplicate VTXOs by point, marking expiring ones
  const expiringPoints = new Set(expiringVtxos.map((vtxo) => vtxo.point));

  const vtxosWithStatus: VTXOWithStatus[] = allVtxos.map((vtxo) => ({
    ...vtxo,
    isExpiring: expiringPoints.has(vtxo.point),
  }));

  const isLoading = isLoadingAll || isLoadingExpiring;

  const filteredVtxos = (() => {
    switch (filter) {
      case "active":
        return vtxosWithStatus.filter((vtxo) => !vtxo.isExpiring);
      case "expiring":
        return vtxosWithStatus.filter((vtxo) => vtxo.isExpiring);
      default:
        return vtxosWithStatus;
    }
  })();

  const getVtxoIcon = (isExpiring: boolean) => {
    return isExpiring ? "warning-outline" : "cube-outline";
  };

  const getVtxoColor = (isExpiring: boolean) => {
    return isExpiring ? "#f97316" : "#22c55e"; // Orange for expiring, green for active
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NoahSafeAreaView className="flex-1 bg-background">
        <View className="p-4 flex-1">
          <View className="flex-row items-center justify-between mb-8">
            <View className="flex-row items-center">
              <Pressable onPress={() => navigation.goBack()} className="mr-4">
                <Icon name="arrow-back-outline" size={24} color="white" />
              </Pressable>
              <Text className="text-2xl font-bold text-foreground">VTXOs</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-muted-foreground text-sm mr-2">
                {vtxosWithStatus.length} total
              </Text>
              <Icon name="cube-outline" size={24} color="white" />
            </View>
          </View>

          <View className="flex-row justify-around mb-4">
            {(["all", "active", "expiring"] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                className={`px-3 py-1 rounded-full ${filter === f ? "bg-primary" : "bg-card"}`}
              >
                <Text
                  className={`text-sm ${
                    filter === f ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {f === "all" ? "All" : f === "active" ? "Active" : "Expiring"}
                  {f === "expiring" && expiringVtxos.length > 0 && ` (${expiringVtxos.length})`}
                </Text>
              </Pressable>
            ))}
          </View>

          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted-foreground">Loading VTXOs...</Text>
            </View>
          ) : filteredVtxos.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <Icon name="cube-outline" size={48} color="#666" />
              <Text className="text-muted-foreground mt-4 text-center">
                {filter === "all"
                  ? "No VTXOs found"
                  : filter === "active"
                    ? "No active VTXOs found"
                    : "No expiring VTXOs found"}
              </Text>
              <Text className="text-muted-foreground text-sm mt-2 text-center">
                You have no VTXOs.
              </Text>
            </View>
          ) : (
            <FlashList
              data={filteredVtxos}
              renderItem={({ item }: { item: VTXOWithStatus }) => (
                <View style={{ marginBottom: 8 }}>
                  <Pressable onPress={() => navigation.navigate("VTXODetail", { vtxo: item })}>
                    <View className="flex-row items-center p-4 bg-card rounded-lg">
                      <View className="mr-4">
                        <Icon
                          name={getVtxoIcon(item.isExpiring)}
                          size={24}
                          color={getVtxoColor(item.isExpiring)}
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row justify-between items-center">
                          <Label className="text-foreground text-base">{item.amount} sats</Label>
                        </View>
                        <Text className="text-muted-foreground text-sm mt-1" numberOfLines={1}>
                          Expiry: Block {item.expiry_height}
                        </Text>
                      </View>
                      <Icon name="chevron-forward-outline" size={24} color="white" />
                    </View>
                  </Pressable>
                </View>
              )}
              keyExtractor={(item: VTXOWithStatus) => item.point}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 50 }}
            />
          )}
        </View>
      </NoahSafeAreaView>
    </GestureHandlerRootView>
  );
};

export default VTXOsScreen;
