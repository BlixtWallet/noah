import React from "react";
import { useSendScreen } from "../hooks/useSendScreen";
import { SendSuccess } from "../components/SendSuccess";
import { SendForm } from "../components/SendForm";
import { NoahSafeAreaView } from "~/components/NoahSafeAreaView";
import { QRCodeScanner } from "~/components/QRCodeScanner";

const SendScreen = () => {
  const {
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
  } = useSendScreen();

  if (parsedResult?.success) {
    return <SendSuccess parsedResult={parsedResult} handleDone={handleDone} />;
  }

  if (showCamera) {
    return <QRCodeScanner codeScanner={codeScanner} onClose={() => setShowCamera(false)} />;
  }

  return (
    <NoahSafeAreaView className="flex-1 bg-background">
      <SendForm
        destination={destination}
        setDestination={setDestination}
        amount={amount}
        setAmount={setAmount}
        isAmountEditable={isAmountEditable}
        comment={comment}
        setComment={setComment}
        handleSend={handleSend}
        isSending={isSending}
        error={error}
        errorMessage={errorMessage}
        handleDone={handleDone}
        handleScanPress={handleScanPress}
        parsedResult={parsedResult}
      />
    </NoahSafeAreaView>
  );
};

export default SendScreen;
