import React from "react";
import { Modal } from "react-native";
import { FeedbackWidget } from "@sentry/react-native";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "~/lib/styleConstants";
import { NoahSafeAreaView } from "./NoahSafeAreaView";

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export const FeedbackModal = ({ visible, onClose }: FeedbackModalProps) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <NoahSafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
        <FeedbackWidget
          onFormClose={onClose}
          onFormSubmitted={onClose}
          enableScreenshot={true}
          showName={true}
          showEmail={true}
          isNameRequired={false}
          isEmailRequired={false}
          formTitle="Send Feedback"
          submitButtonLabel="Submit Feedback"
          cancelButtonLabel="Cancel"
          messageLabel="Description"
          messagePlaceholder="Describe the bug or share your feedback..."
          nameLabel="Name (Optional)"
          namePlaceholder="Your name"
          emailLabel="Email (Optional)"
          emailPlaceholder="your.email@example.com"
          addScreenshotButtonLabel="Add Screenshot"
          successMessageText="Thank you! We received your feedback."
          styles={{
            container: {
              backgroundColor: "#09090b",
              padding: 16,
            },
            title: {
              fontSize: 24,
              fontWeight: "bold",
              color: "#fafafa",
              marginBottom: 20,
            },
            label: {
              fontSize: 16,
              color: "#fafafa",
              marginBottom: 8,
              fontWeight: "600",
            },
            input: {
              backgroundColor: "#18181b",
              borderColor: "#27272a",
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
              color: "#fafafa",
              fontSize: 16,
              marginBottom: 16,
            },
            textArea: {
              backgroundColor: "#18181b",
              borderColor: "#27272a",
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
              color: "#fafafa",
              fontSize: 16,
              minHeight: 120,
              textAlignVertical: "top",
              marginBottom: 16,
            },
            submitButton: {
              backgroundColor: COLORS.BITCOIN_ORANGE,
              borderRadius: 8,
              padding: 16,
              alignItems: "center",
              marginBottom: 12,
            },
            submitText: {
              color: "#ffffff",
              fontSize: 18,
              fontWeight: "bold",
            },
            cancelButton: {
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: "#27272a",
              borderRadius: 8,
              padding: 16,
              alignItems: "center",
            },
            cancelText: {
              color: "#fafafa",
              fontSize: 18,
              fontWeight: "600",
            },
            screenshotButton: {
              backgroundColor: "#18181b",
              borderWidth: 1,
              borderColor: "#27272a",
              borderRadius: 8,
              padding: 12,
              alignItems: "center",
              marginBottom: 16,
            },
            screenshotText: {
              color: COLORS.BITCOIN_ORANGE,
              fontSize: 16,
              fontWeight: "600",
            },
          }}
          onAddScreenshot={async (addScreenshot) => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: "images",
              allowsEditing: true,
              quality: 0.8,
            });

            if (!result.canceled && result.assets?.[0]?.uri) {
              addScreenshot(result.assets[0].uri);
            }
          }}
        />
      </NoahSafeAreaView>
    </Modal>
  );
};
