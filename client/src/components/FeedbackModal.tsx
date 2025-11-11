import React, { useState } from "react";
import {
  Modal,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import * as Sentry from "@sentry/react-native";
import { COLORS } from "~/lib/styleConstants";
import { NoahSafeAreaView } from "./NoahSafeAreaView";
import { Text } from "./ui/text";
import { X, ImagePlus, CheckCircle, AlertCircle } from "lucide-react-native";
import Logger from "~/lib/log";

const log = Logger("FeedbackModal");

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

export const FeedbackModal = ({ visible, onClose }: FeedbackModalProps) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  const resetForm = () => {
    setName("");
    setEmail("");
    setMessage("");
    setScreenshot(null);
    setSubmitState("idle");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      return;
    }

    setSubmitState("submitting");

    const trimmedMessage = message.trim();
    const trimmedName = name.trim() || undefined;
    const trimmedEmail = email.trim() || undefined;

    try {
      const eventId = Sentry.captureMessage("User Feedback");

      const feedbackParams = {
        message: trimmedMessage,
        name: trimmedName,
        email: trimmedEmail,
        associatedEventId: eventId,
      };

      let feedbackHint;

      if (screenshot) {
        const file = new File(screenshot);
        const base64Data = file.base64Sync();

        feedbackHint = {
          attachments: [
            {
              filename: "screenshot.jpg",
              data: base64Data,
              contentType: "image/jpeg",
            },
          ],
        };
      }

      Sentry.captureFeedback(feedbackParams, feedbackHint);

      setSubmitState("success");
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      log.e("Failed to submit feedback:", [error]);
      setSubmitState("error");
      setTimeout(() => {
        setSubmitState("idle");
      }, 3000);
    }
  };

  const handleAddScreenshot = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setScreenshot(result.assets[0].uri);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
  };

  if (submitState === "success") {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={handleClose}
        presentationStyle="pageSheet"
      >
        <NoahSafeAreaView className="flex-1 bg-zinc-950 items-center justify-center px-6">
          <View className="items-center">
            <CheckCircle size={64} color={COLORS.BITCOIN_ORANGE} />
            <Text className="text-2xl font-bold text-white mt-6 mb-2">Thank You!</Text>
            <Text className="text-base text-zinc-400 text-center">
              We received your feedback and will review it shortly.
            </Text>
          </View>
        </NoahSafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="pageSheet"
    >
      <NoahSafeAreaView className="flex-1 bg-zinc-950">
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-zinc-800">
          <Text className="text-2xl font-bold text-white">Send Feedback</Text>
          <Pressable
            onPress={handleClose}
            className="w-10 h-10 items-center justify-center rounded-full bg-zinc-900"
          >
            <X size={24} color="#fff" />
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          <View className="py-6">
            {submitState === "error" && (
              <View className="flex-row items-center bg-red-950/50 border border-red-900 rounded-xl p-4 mb-6">
                <AlertCircle size={20} color="#ef4444" />
                <Text className="text-red-400 ml-3 flex-1">
                  Failed to submit feedback. Please try again.
                </Text>
              </View>
            )}

            <View className="mb-6">
              <Text className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wide">
                Name (Optional)
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 text-white text-base"
                editable={submitState === "idle"}
              />
            </View>

            <View className="mb-6">
              <Text className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wide">
                Email (Optional)
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="your.email@example.com"
                placeholderTextColor="#52525b"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 text-white text-base"
                editable={submitState === "idle"}
              />
            </View>

            <View className="mb-6">
              <Text className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wide">
                Message *
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Describe the bug or share your feedback..."
                placeholderTextColor="#52525b"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 text-white text-base min-h-[140px]"
                editable={submitState === "idle"}
              />
            </View>

            {screenshot ? (
              <View className="mb-6">
                <Text className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wide">
                  Screenshot
                </Text>
                <View className="relative">
                  <Image
                    source={{ uri: screenshot }}
                    className="w-full h-48 rounded-xl"
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={removeScreenshot}
                    className="absolute top-2 right-2 w-8 h-8 bg-zinc-900/90 rounded-full items-center justify-center"
                  >
                    <X size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={handleAddScreenshot}
                className="flex-row items-center justify-center bg-zinc-900 border border-zinc-700 rounded-xl py-4 mb-6"
                disabled={submitState !== "idle"}
              >
                <ImagePlus size={20} color={COLORS.BITCOIN_ORANGE} />
                <Text
                  className="text-base font-semibold ml-2"
                  style={{ color: COLORS.BITCOIN_ORANGE }}
                >
                  Add Screenshot
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        <View className="px-5 py-4 border-t border-zinc-800">
          <Pressable
            onPress={handleSubmit}
            disabled={!message.trim() || submitState !== "idle"}
            className={`rounded-xl py-4 items-center mb-3 ${
              !message.trim() || submitState !== "idle" ? "bg-zinc-800" : "bg-[#F7931A]"
            }`}
            style={
              message.trim() && submitState === "idle"
                ? {
                    shadowColor: COLORS.BITCOIN_ORANGE,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 8,
                  }
                : {}
            }
          >
            {submitState === "submitting" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                className={`text-base font-bold ${
                  !message.trim() || submitState !== "idle" ? "text-zinc-600" : "text-white"
                }`}
              >
                Submit Feedback
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleClose}
            disabled={submitState === "submitting"}
            className="bg-zinc-900 border border-zinc-700 rounded-xl py-4 items-center"
          >
            <Text className="text-base font-semibold text-zinc-300">Cancel</Text>
          </Pressable>
        </View>
      </NoahSafeAreaView>
    </Modal>
  );
};
