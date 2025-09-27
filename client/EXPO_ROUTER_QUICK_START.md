# Expo Router Migration Quick Start

## ✅ What's Already Done

1. **File-based routing structure created** - All routes are set up in the `app/` directory
2. **Root layout configured** - Providers, theme, and authentication logic moved to `app/_layout.tsx`
3. **Tab navigation implemented** - Bottom tabs working with proper icons
4. **Navigation stacks created** - Home and Settings stacks are configured
5. **Onboarding flow set up** - Separate onboarding route group created
6. **Migration hook created** - `useAppNavigation` hook for easier migration
7. **Example screens migrated**:
   - HomeScreen
   - SettingsScreen
   - TransactionDetailScreen
   - TransactionsScreen

## 🚀 Quick Migration Steps for Remaining Screens

### Step 1: Update Imports

Replace these imports in each screen:
```typescript
// Remove these
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { HomeStackParamList, SettingsStackParamList } from "../Navigators";

// Add this instead
import { useRouter, useLocalSearchParams } from "expo-router";
```

### Step 2: Update Navigation Usage

Replace navigation code:
```typescript
// Before
const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
navigation.navigate("BoardArk");
navigation.goBack();

// After
const router = useRouter();
router.push("/(tabs)/(home)/board-ark");
router.back();
```

### Step 3: Update Parameter Access

Replace route params:
```typescript
// Before
const route = useRoute<RouteProp<HomeStackParamList, "Send">>();
const { destination } = route.params;

// After
const params = useLocalSearchParams();
const destination = params.destination as string;
```

### Step 4: Handle Complex Parameters

For objects passed as parameters:
```typescript
// When navigating
const transaction = { id: "123", amount: 100 };
router.push(`/(tabs)/(home)/transaction-detail?transaction=${encodeURIComponent(JSON.stringify(transaction))}`);

// When receiving
const params = useLocalSearchParams();
const transaction = params.transaction ? JSON.parse(params.transaction as string) : null;
```

## 📝 Screens Checklist

### Priority 1 - Core Navigation
- [x] HomeScreen
- [x] SettingsScreen 
- [x] TransactionsScreen
- [x] TransactionDetailScreen
- [x] SendScreen
- [x] ReceiveScreen
- [x] BoardArkScreen

### Priority 2 - Onboarding Flow
- [x] OnboardingScreen
- [x] MnemonicScreen (handle both onboarding and settings contexts)
- [x] RestoreWalletScreen
- [x] LightningAddressScreen (handle both contexts)

### Priority 3 - Settings Stack
- [x] LogScreen
- [x] BackupSettingsScreen
- [x] VTXOsScreen
- [x] VTXODetailScreen

### Priority 4 - Boarding Flow
- [x] BoardingTransactionsScreen
- [x] BoardingTransactionDetailScreen

## 🔧 Common Patterns

### Back Navigation
```typescript
// React Navigation
navigation.goBack()

// Expo Router
router.back()
```

### Navigate to Tab
```typescript
// React Navigation
navigation.navigate("Settings")

// Expo Router
router.push("/(tabs)/settings")
```

### Replace Current Screen
```typescript
// React Navigation
navigation.replace("Home")

// Expo Router
router.replace("/(tabs)/(home)")
```

### Navigate with Parameters
```typescript
// React Navigation
navigation.navigate("Send", { destination: "bitcoin:..." })

// Expo Router
router.push(`/(tabs)/(home)/send-to?destination=${encodeURIComponent("bitcoin:...")}`)
```

## 🎯 Next Steps

1. ✅ **All screens migrated** - All screens have been successfully migrated to Expo Router
2. **Test navigation flows** - Ensure all navigation paths work correctly
3. **Remove old files**:
   - Delete `src/Navigators.tsx`
   - Delete `App.tsx` (no longer needed)
   - Delete `index.ts` (no longer needed)
4. **Update deep linking** - Configure if you have external deep links
5. **Test on both platforms** - iOS and Android

## 💡 Tips

1. **Use the migration hook** - If you want an easier migration, use `useAppNavigation()` which maintains the old API
2. **Check for null parameters** - Always validate parameters that come from navigation
3. **Encode complex data** - Use `JSON.stringify` and `encodeURIComponent` for objects
4. **Test back navigation** - Ensure `router.back()` works in all contexts
5. **Conditional routing** - Use pathname to determine current context (e.g., onboarding vs main app)

## ⚠️ Common Issues

1. **TypeScript errors with parameters** - Cast parameters to proper types: `params.id as string`
2. **Lost navigation state** - Use `router.replace()` instead of `router.push()` when appropriate
3. **Tab icons not showing** - Ensure Icon.getImageSourceSync returns valid image source
4. **Deep linking not working** - Check that all routes start with `/`
5. **Onboarding flow issues** - Ensure wallet initialization properly switches between route groups

## 📚 Resources

- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [Migration Guide](./EXPO_ROUTER_MIGRATION.md) - Detailed migration guide
- [Navigation Hook](./src/hooks/useAppNavigation.ts) - Migration helper hook