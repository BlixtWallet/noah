import React from "react";
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
};

export const DangerZoneRow = ({ title, isPressable, variant = "default" }: DangerZoneRowProps) => {
  return (
    <Pressable
      disabled={!isPressable}
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
  trigger: React.ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  children?: React.ReactNode;
};

export const ConfirmationDialog = ({
  trigger,
  title,
  description,
  onConfirm,
  children,
}: ConfirmationDialogProps) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="flex-row space-x-2">
          <AlertDialogCancel className="flex-1">
            <Text>Cancel</Text>
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onPress={onConfirm} className="flex-1">
            <Text>Confirm</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
