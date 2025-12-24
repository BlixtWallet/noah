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
import { useTheme } from "~/hooks/useTheme";

const log = Logger("FeedbackModal");

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

export const FeedbackModal = ({ visible, onClose }: FeedbackModalProps) => {
  const { isDark } = useTheme();
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
        const bytes = await file.bytes();

        feedbackHint = {
          attachments: [
            {
              filename: "screenshot.jpg",
              data: bytes,
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
        <NoahSafeAreaView
          className={`flex-1 items-center justify-center px-6 ${isDark ? "bg-zinc-950" : "bg-gray-50"}`}
        >
          <View className="items-center">
            <CheckCircle size={64} color={COLORS.BITCOIN_ORANGE} />
            <Text
              className={`text-2xl font-bold mt-6 mb-2 ${isDark ? "text-white" : "text-gray-900"}`}
            >
              Thank You!
            </Text>
            <Text className={`text-base text-center ${isDark ? "text-zinc-400" : "text-gray-600"}`}>
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
      <NoahSafeAreaView className={`flex-1 ${isDark ? "bg-zinc-950" : "bg-gray-50"}`}>
        <View
          className={`flex-row items-center justify-between px-5 py-4 border-b ${isDark ? "border-zinc-800" : "border-gray-200"}`}
        >
          <Text className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            Send Feedback
          </Text>
          <Pressable
            onPress={handleClose}
            className={`w-10 h-10 items-center justify-center rounded-full ${isDark ? "bg-zinc-900" : "bg-gray-200"}`}
          >
            <X size={24} color={isDark ? "#fff" : "#374151"} />
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
              <Text
                className={`text-sm font-medium mb-2 uppercase tracking-wide ${isDark ? "text-zinc-400" : "text-gray-500"}`}
              >
                Name (Optional)
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={isDark ? "#52525b" : "#9ca3af"}
                className={`border rounded-xl px-4 py-4 text-base ${isDark ? "bg-zinc-900 border-zinc-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                editable={submitState === "idle"}
              />
            </View>

            <View className="mb-6">
              <Text
                className={`text-sm font-medium mb-2 uppercase tracking-wide ${isDark ? "text-zinc-400" : "text-gray-500"}`}
              >
                Email (Optional)
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="your.email@example.com"
                placeholderTextColor={isDark ? "#52525b" : "#9ca3af"}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className={`border rounded-xl px-4 py-4 text-base ${isDark ? "bg-zinc-900 border-zinc-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                editable={submitState === "idle"}
              />
            </View>

            <View className="mb-6">
              <Text
                className={`text-sm font-medium mb-2 uppercase tracking-wide ${isDark ? "text-zinc-400" : "text-gray-500"}`}
              >
                Message *
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Describe the bug or share your feedback..."
                placeholderTextColor={isDark ? "#52525b" : "#9ca3af"}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                className={`border rounded-xl px-4 py-4 text-base min-h-[140px] ${isDark ? "bg-zinc-900 border-zinc-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                editable={submitState === "idle"}
              />
            </View>

            {screenshot ? (
              <View className="mb-6">
                <Text
                  className={`text-sm font-medium mb-2 uppercase tracking-wide ${isDark ? "text-zinc-400" : "text-gray-500"}`}
                >
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
                    className={`absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center ${isDark ? "bg-zinc-900/90" : "bg-gray-800/80"}`}
                  >
                    <X size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={handleAddScreenshot}
                className={`flex-row items-center justify-center border rounded-xl py-4 mb-6 ${isDark ? "bg-zinc-900 border-zinc-700" : "bg-white border-gray-300"}`}
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

        <View className={`px-5 py-4 border-t ${isDark ? "border-zinc-800" : "border-gray-200"}`}>
          <Pressable
            onPress={handleSubmit}
            disabled={!message.trim() || submitState !== "idle"}
            className={`rounded-xl py-4 items-center mb-3 ${
              !message.trim() || submitState !== "idle"
                ? isDark
                  ? "bg-zinc-800"
                  : "bg-gray-200"
                : "bg-[#F7931A]"
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
                  !message.trim() || submitState !== "idle"
                    ? isDark
                      ? "text-zinc-600"
                      : "text-gray-400"
                    : "text-white"
                }`}
              >
                Submit Feedback
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleClose}
            disabled={submitState === "submitting"}
            className={`border rounded-xl py-4 items-center ${isDark ? "bg-zinc-900 border-zinc-700" : "bg-white border-gray-300"}`}
          >
            <Text
              className={`text-base font-semibold ${isDark ? "text-zinc-300" : "text-gray-700"}`}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
      </NoahSafeAreaView>
    </Modal>
  );
};
