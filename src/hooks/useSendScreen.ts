import { useState, useEffect, useMemo } from "react";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useAlert } from "~/contexts/AlertProvider";
import { parseDestination, isValidDestination, type DestinationTypes } from "../lib/sendUtils";
import { useSend } from "../hooks/usePayments";
import {
  type ArkoorPaymentResult,
  type Bolt11PaymentResult,
  type LnurlPaymentResult,
  type OnchainPaymentResult,
  type PaymentResult,
} from "../lib/paymentsApi";
import { useQRCodeScanner } from "~/hooks/useQRCodeScanner";
import { useTransactionStore } from "~/store/transactionStore";

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
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [isAmountEditable, setIsAmountEditable] = useState(true);
  const [comment, setComment] = useState("");
  const [parsedResult, setParsedResult] = useState<DisplayResult | null>(null);
  const [destinationType, setDestinationType] = useState<DestinationTypes | null>(null);

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
      setAmount(newAmount?.toString() ?? "");
      setIsAmountEditable(newIsAmountEditable);
    } else {
      setDestinationType(null);
      setAmount("");
      setIsAmountEditable(true);
    }
  }, [destination, showAlert]);

  const {
    mutate: send,
    isPending: isSending,
    data: result,
    error,
    reset,
  } = useSend(destinationType);

  useEffect(() => {
    if (!result) {
      return;
    }

    const satoshis = parseInt(amount, 10) || 0;
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
            amount_sat: satoshis,
            destination: lnurlRes.lnurl,
            preimage: lnurlRes.preimage,
            type: res.payment_type,
          };
        }
        case "Bolt11": {
          const bolt11Res = res as Bolt11PaymentResult;
          return {
            success: true,
            amount_sat: satoshis,
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
          id: displayResult.txid || displayResult.preimage || Math.random().toString(),
          type: result.payment_type,
          amount: displayResult.amount_sat,
          date: new Date().toISOString(),
          direction: "outgoing",
          description: comment,
          txid: displayResult.txid,
          preimage: displayResult.preimage,
          destination: displayResult.destination,
        });
      }
      setParsedResult(displayResult);
    }
  }, [result, amount, showAlert, addTransaction, destinationType, comment]);

  const handleSend = () => {
    let amountSat: number | undefined = parseInt(amount, 10);

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

    if (destinationType === "lightning" && amountSat !== 0) {
      amountSat = undefined;
    }

    const cleanedDestination = destination.replace(/^(bitcoin:|lightning:)/i, "");

    send({
      destination: cleanedDestination,
      amountSat,
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
  };
};
