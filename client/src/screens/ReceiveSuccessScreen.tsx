import React from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { HomeStackParamList } from "../Navigators";
import { ReceiveSuccess } from "../components/ReceiveSuccess";
import { useBtcToUsdRate } from "../hooks/useMarketData";

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, "ReceiveSuccess">;
type ReceiveSuccessRouteProp = RouteProp<HomeStackParamList, "ReceiveSuccess">;

const ReceiveSuccessScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReceiveSuccessRouteProp>();
  const { amountSat } = route.params;
  const { data: btcPrice } = useBtcToUsdRate();

  const handleDone = () => {
    navigation.navigate("HomeStack");
  };

  return <ReceiveSuccess amountSat={amountSat} btcPrice={btcPrice} handleDone={handleDone} />;
};

export default ReceiveSuccessScreen;
