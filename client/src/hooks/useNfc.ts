import { useState, useEffect, useCallback } from "react";
import { Platform, Alert } from "react-native";
import {
  checkNfcStatus,
  startNfcSend,
  startNfcReceive,
  stopNfc,
  type NfcPaymentData,
  type NfcStatus,
} from "noah-tools";
import { useAlert } from "~/contexts/AlertProvider";
import logger from "~/lib/log";

const log = logger("useNfc");

export const useNfc = () => {
  const { showAlert } = useAlert();
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isNfcEnabled, setIsNfcEnabled] = useState(false);
  const [isNfcActive, setIsNfcActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Check NFC status on mount
  useEffect(() => {
    checkNfcAvailability();

    return () => {
      // Clean up NFC when component unmounts
      if (isNfcActive) {
        stopNfc();
      }
    };
  }, []);

  const checkNfcAvailability = async () => {
    try {
      const status: NfcStatus = await checkNfcStatus();
      setIsNfcSupported(status.isSupported);
      setIsNfcEnabled(status.isEnabled);

      log.d("NFC Status", [status]);
    } catch (error) {
      log.e("Failed to check NFC status", [error]);
      setIsNfcSupported(false);
      setIsNfcEnabled(false);
    }
  };

  const sendPaymentViaNfc = useCallback(
    async (paymentData: NfcPaymentData): Promise<boolean> => {
      if (!isNfcSupported) {
        showAlert({
          title: "NFC Not Supported",
          description: "Your device does not support NFC.",
        });
        return false;
      }

      if (!isNfcEnabled) {
        showAlert({
          title: "NFC Disabled",
          description:
            Platform.OS === "ios"
              ? "Please ensure NFC is available on your device."
              : "Please enable NFC in your device settings.",
        });
        return false;
      }

      try {
        setIsProcessing(true);
        setIsNfcActive(true);

        log.d("Starting NFC send", [paymentData]);

        const success = await startNfcSend(paymentData);

        if (success) {
          showAlert({
            title: "NFC Ready",
            description: "Hold your device near another device to send payment information.",
          });
        }

        return success;
      } catch (error) {
        log.e("Failed to send via NFC", [error]);
        showAlert({
          title: "NFC Error",
          description: error instanceof Error ? error.message : "Failed to send payment via NFC",
        });
        return false;
      } finally {
        setIsProcessing(false);
        setIsNfcActive(false);
      }
    },
    [isNfcSupported, isNfcEnabled, showAlert],
  );

  const receivePaymentViaNfc = useCallback(async (): Promise<NfcPaymentData | null> => {
    if (!isNfcSupported) {
      showAlert({
        title: "NFC Not Supported",
        description: "Your device does not support NFC.",
      });
      return null;
    }

    if (!isNfcEnabled) {
      showAlert({
        title: "NFC Disabled",
        description:
          Platform.OS === "ios"
            ? "Please ensure NFC is available on your device."
            : "Please enable NFC in your device settings.",
      });
      return null;
    }

    try {
      setIsProcessing(true);
      setIsNfcActive(true);

      log.d("Starting NFC receive");

      // Show alert to user
      Alert.alert(
        "NFC Ready",
        "Hold your device near another device to receive payment information.",
        [
          {
            text: "Cancel",
            onPress: () => {
              stopNfc();
              setIsNfcActive(false);
            },
            style: "cancel",
          },
        ],
        { cancelable: false },
      );

      const receivedData = await startNfcReceive();

      log.d("Received NFC data", [receivedData]);

      return receivedData;
    } catch (error) {
      log.e("Failed to receive via NFC", [error]);
      showAlert({
        title: "NFC Error",
        description: error instanceof Error ? error.message : "Failed to receive payment via NFC",
      });
      return null;
    } finally {
      setIsProcessing(false);
      setIsNfcActive(false);
    }
  }, [isNfcSupported, isNfcEnabled, showAlert]);

  const cancelNfc = useCallback(() => {
    if (isNfcActive) {
      stopNfc();
      setIsNfcActive(false);
      setIsProcessing(false);
    }
  }, [isNfcActive]);

  return {
    isNfcSupported,
    isNfcEnabled,
    isNfcActive,
    isProcessing,
    sendPaymentViaNfc,
    receivePaymentViaNfc,
    cancelNfc,
    checkNfcAvailability,
  };
};
