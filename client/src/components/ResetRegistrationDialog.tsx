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
import { useServerStore } from "../store/serverStore";
import { Pressable, View } from "react-native";
import { Label } from "./ui/label";
import Icon from "@react-native-vector-icons/ionicons";

type ResetRegistrationDialogProps = {
  title: string;
  isPressable: boolean;
};

export const ResetRegistrationDialog = ({ title, isPressable }: ResetRegistrationDialogProps) => {
  const { resetRegistration } = useServerStore();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Pressable
          disabled={!isPressable}
          className="flex-row justify-between items-center p-4 border-b border-border bg-card rounded-lg mb-2"
        >
          <View>
            <Label className="text-foreground text-lg">{title}</Label>
          </View>
          {isPressable && <Icon name="chevron-forward-outline" size={24} color="white" />}
        </Pressable>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Server Registration</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to reset your server registration? This will not delete your
            wallet, but you will need to register with the server again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row space-x-2">
          <AlertDialogCancel className="flex-1">
            <Text>Cancel</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onPress={() => {
              resetRegistration();
              // TODO: Add toast notification
            }}
            className="flex-1"
          >
            <Text>Reset</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
