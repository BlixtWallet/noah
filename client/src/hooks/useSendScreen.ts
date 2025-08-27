import { useState, useEffect, useMemo, useCallback } from "react";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useAlert } from "~/contexts/AlertProvider";
import { parseDestination, isValidDestination, type DestinationTypes } from "../lib/sendUtils";
import { useSend } from "./usePayments";
import {
  type ArkoorPaymentResult,
  type LightningPaymentResult,
  type LnurlPaymentResult,
  type OnchainPaymentResult,
  type PaymentResult,
} from "../lib/paymentsApi";
import { useQRCodeScanner } from "~/hooks/useQRCodeScanner";
import { useTransactionStore } from "~/store/transactionStore";
import { useBtcToUsdRate } from "./useMarketData";
import uuid from "react-native-uuid";

type DisplayResult = {
  amount_sat: number;
  destination: string;
  txid?: string;
  preimage?: string;
  success: boolean;
  type: string;
};

type SendScreenRouteProp = RouteProp<{ params: { destination?: string } }, "params">;

export const useSendScreen = () => {
  const route = useRoute<SendScreenRouteProp>();
  const { showAlert } = useAlert();
  const { addTransaction } = useTransactionStore();
  const { data: btcPrice } = useBtcToUsdRate();
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [isAmountEditable, setIsAmountEditable] = useState(true);
  const [comment, setComment] = useState("");
  const [parsedResult, setParsedResult] = useState<DisplayResult | null>(null);
  const [destinationType, setDestinationType] = useState<DestinationTypes | null>(null);
  const [currency, setCurrency] = useState<"USD" | "SATS">("SATS");
  const [parsedAmount, setParsedAmount] = useState<number | null>(null);

  useEffect(() => {
    if (route.params?.destination) {
      setDestination(route.params.destination);
    }
  }, [route.params]);

  useEffect(() => {
    if (destination) {
      const {
        destinationType: newDestinationType,
        amount: newAmount,
        isAmountEditable: newIsAmountEditable,
        error: parseError,
      } = parseDestination(destination);

      if (parseError) {
        showAlert({ title: "Invalid Destination", description: parseError });
      }

      setDestinationType(newDestinationType);
      if (newAmount) {
        setCurrency("SATS");
        setAmount(newAmount.toString());
        setParsedAmount(newAmount);
      } else {
        setAmount("");
        setParsedAmount(null);
      }
      setIsAmountEditable(newIsAmountEditable);
    } else {
      setDestinationType(null);
      setAmount("");
      setIsAmountEditable(true);
      setParsedAmount(null);
    }
  }, [destination, showAlert]);

  const {
    mutate: send,
    isPending: isSending,
    data: result,
    error,
    reset,
  } = useSend(destinationType);

  const amountSat = useMemo(() => {
    if (currency === "SATS") {
      return parseInt(amount, 10) || 0;
    }
    if (btcPrice) {
      return Math.round((parseFloat(amount) / btcPrice) * 100000000);
    }
    return 0;
  }, [amount, currency, btcPrice]);

  const toggleCurrency = useCallback(() => {
    setCurrency((prev) => (prev === "SATS" ? "USD" : "SATS"));
  }, []);

  useEffect(() => {
    if (!result) {
      return;
    }

    let displayResult: DisplayResult | null = null;

    const processResult = (res: PaymentResult) => {
      switch (res.payment_type) {
        case "Onchain": {
          const onchainRes = res as OnchainPaymentResult;
          return {
            success: true,
            amount_sat: onchainRes.amount_sat,
            destination: onchainRes.destination_address,
            txid: onchainRes.txid,
            type: res.payment_type,
          };
        }
        case "Arkoor": {
          const arkoorRes = res as ArkoorPaymentResult;
          return {
            success: true,
            amount_sat: arkoorRes.amount_sat,
            destination: arkoorRes.destination_pubkey,
            type: res.payment_type,
          };
        }
        case "Lnurl": {
          const lnurlRes = res as LnurlPaymentResult;
          return {
            success: true,
            amount_sat: amountSat,
            destination: lnurlRes.lnurl,
            preimage: lnurlRes.preimage,
            type: res.payment_type,
          };
        }
        case "Bolt11": {
          const bolt11Res = res as LightningPaymentResult;
          return {
            success: true,
            amount_sat: amountSat,
            destination: bolt11Res.bolt11_invoice,
            preimage: bolt11Res.preimage,
            type: res.payment_type,
          };
        }
        default:
          console.error("Could not process the transaction result. Unknown result type:", result);
          showAlert({
            title: "Error",
            description: "Could not process the transaction result. Unknown result type.",
          });
          return {
            success: false,
            amount_sat: 0,
            destination: "",
            type: "error",
          };
      }
    };

    displayResult = processResult(result);

    if (displayResult) {
      if (displayResult.success) {
        addTransaction({
          id: uuid.v4().toString(),
          type: result.payment_type,
          amount: displayResult.amount_sat,
          date: new Date().toISOString(),
          direction: "outgoing",
          description: comment,
          txid: displayResult.txid,
          preimage: displayResult.preimage,
          destination: displayResult.destination,
          btcPrice: btcPrice,
        });
      }
      setParsedResult(displayResult);
    }
  }, [result, amountSat, showAlert, addTransaction, destinationType, comment, btcPrice]);

  const handleSend = () => {
    if (!isValidDestination(destination)) {
      showAlert({
        title: "Invalid Destination",
        description:
          "Please enter a valid Bitcoin address, BOLT11 invoice, Lightning Address, or Ark public key.",
      });
      return;
    }
    if (isNaN(amountSat) || amountSat <= 0) {
      showAlert({ title: "Invalid Amount", description: "Please enter a valid amount." });
      return;
    }

    const cleanedDestination = destination.replace(/^(bitcoin:|lightning:)/i, "");

    send({
      destination: cleanedDestination,
      amountSat: destinationType === "lightning" ? undefined : amountSat,
      comment: comment || null,
    });
  };

  const handleDone = () => {
    reset();
    setParsedResult(null);
    setDestination("");
    setAmount("");
    setComment("");
  };

  const { showCamera, setShowCamera, handleScanPress, codeScanner } = useQRCodeScanner({
    onScan: (value) => {
      setDestination(value);
    },
  });

  const errorMessage = useMemo(() => {
    if (!error) return "The transaction failed. Please try again.";
    return error instanceof Error ? error.message : String(error);
  }, [error]);

  return {
    destination,
    setDestination,
    amount,
    setAmount,
    isAmountEditable,
    comment,
    setComment,
    parsedResult,
    handleSend,
    handleDone,
    isSending,
    error,
    errorMessage,
    showCamera,
    setShowCamera,
    handleScanPress,
    codeScanner,
    currency,
    toggleCurrency,
    amountSat,
    btcPrice,
    parsedAmount,
  };
};
