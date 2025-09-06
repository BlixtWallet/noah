import React from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import * as Haptics from "expo-haptics";

export type CopyToClipboardOptions = {
  /** Whether to trigger haptic feedback (default: true) */
  hapticFeedback?: boolean;
  /** Type of haptic feedback to use (default: Success) */
  hapticType?: Haptics.NotificationFeedbackType;
  /** Optional callback to execute after copying */
  onCopy?: () => void;
};

/**
 * Copies text to clipboard with optional haptic feedback
 * @param text - The text to copy to clipboard
 * @param options - Configuration options for the copy operation
 */
export const copyToClipboard = async (
  text: string,
  options: CopyToClipboardOptions = {},
): Promise<void> => {
  const {
    hapticFeedback = true,
    hapticType = Haptics.NotificationFeedbackType.Success,
    onCopy,
  } = options;

  try {
    // Copy to clipboard
    Clipboard.setString(text);

    // Trigger haptic feedback if enabled
    if (hapticFeedback) {
      await Haptics.notificationAsync(hapticType);
    }

    // Execute callback if provided
    if (onCopy) {
      onCopy();
    }
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    // Still execute callback even if haptic feedback fails
    if (onCopy) {
      onCopy();
    }
  }
};

/**
 * Hook for managing copy state with automatic reset
 * @param resetDelay - Time in milliseconds before resetting copied state (default: 2000)
 * @returns Object with copied state, copy function, and manual reset function
 */
export const useCopyToClipboard = (resetDelay: number = 2000) => {
  const [copiedValue, setCopiedValue] = React.useState<string | null>(null);

  const copyWithState = React.useCallback(
    async (text: string, identifier?: string, options: CopyToClipboardOptions = {}) => {
      await copyToClipboard(text, {
        ...options,
        onCopy: () => {
          setCopiedValue(identifier || text);
          options.onCopy?.();
        },
      });

      // Auto-reset after delay
      setTimeout(() => setCopiedValue(null), resetDelay);
    },
    [resetDelay],
  );

  const resetCopiedState = React.useCallback(() => {
    setCopiedValue(null);
  }, []);

  const isCopied = React.useCallback(
    (identifier?: string) => {
      if (!identifier) return copiedValue !== null;
      return copiedValue === identifier;
    },
    [copiedValue],
  );

  return {
    copiedValue,
    copyWithState,
    resetCopiedState,
    isCopied,
  };
};
