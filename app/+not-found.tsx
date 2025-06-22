import { Link, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "~/components/ui/text";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <SafeAreaView className="flex-1 justify-center items-center gap-4">
        <Text className="text-xl">This screen doesn't exist.</Text>

        <Link href="/">
          <Text className="text-base text-primary">Go to home screen!</Text>
        </Link>
      </SafeAreaView>
    </>
  );
}
