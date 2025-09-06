import React from "react";
import * as Haptics from "expo-haptics";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Text } from "./ui/text";
import { Pressable, View } from "react-native";
import { Label } from "./ui/label";
import Icon from "@react-native-vector-icons/ionicons";

type DangerZoneRowProps = {
  title: string;
  isPressable: boolean;
  variant?: "default" | "destructive";
  onPress?: () => void;
};

export const DangerZoneRow = ({
  title,
  isPressable,
  variant = "default",
  onPress,
}: DangerZoneRowProps) => {
  return (
    <Pressable
      disabled={!isPressable}
      onPress={onPress}
      className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-2"
    >
      <View>
        <Label
          className={`text-lg ${variant === "destructive" ? "text-destructive" : "text-foreground"}`}
        >
          {title}
        </Label>
      </View>
      {isPressable && <Icon name="chevron-forward-outline" size={24} color="white" />}
    </Pressable>
  );
};

type ConfirmationDialogProps = {
  trigger?: React.ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
  confirmText?: string;
  confirmVariant?: "default" | "destructive";
  isConfirmDisabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Haptic feedback type for confirm action (default: Success for default variant, Warning for destructive) */
  confirmHapticType?: Haptics.NotificationFeedbackType;
  /** Haptic feedback type for cancel action (default: Light) */
  cancelHapticType?: Haptics.ImpactFeedbackStyle;
  /** Whether to enable haptic feedback (default: true) */
  enableHaptics?: boolean;
};

export const ConfirmationDialog = ({
  trigger,
  title,
  description,
  onConfirm,
  onCancel,
  children,
  confirmText = "Confirm",
  confirmVariant = "destructive",
  isConfirmDisabled,
  open,
  onOpenChange,
  confirmHapticType,
  cancelHapticType = Haptics.ImpactFeedbackStyle.Light,
  enableHaptics = true,
}: ConfirmationDialogProps) => {
  // Set default haptic type based on variant
  const defaultConfirmHapticType =
    confirmVariant === "destructive"
      ? Haptics.NotificationFeedbackType.Warning
      : Haptics.NotificationFeedbackType.Success;

  const finalConfirmHapticType = confirmHapticType ?? defaultConfirmHapticType;

  const handleConfirm = async () => {
    if (enableHaptics) {
      await Haptics.notificationAsync(finalConfirmHapticType);
    }
    onConfirm();
  };

  const handleCancel = async () => {
    if (enableHaptics) {
      await Haptics.impactAsync(cancelHapticType);
    }
    onCancel?.();
  };
  const content = (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {children}
      <AlertDialogFooter className="flex-row space-x-2">
        <AlertDialogCancel onPress={handleCancel} className="flex-1">
          <Text>Cancel</Text>
        </AlertDialogCancel>
        <AlertDialogAction
          variant={confirmVariant}
          onPress={handleConfirm}
          className="flex-1"
          disabled={isConfirmDisabled}
        >
          <Text>{confirmText}</Text>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );

  if (trigger) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
        {content}
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {content}
    </AlertDialog>
  );
};
