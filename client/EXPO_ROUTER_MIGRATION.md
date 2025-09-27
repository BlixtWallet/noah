# Expo Router Migration Guide

## Overview

This guide helps you migrate the remaining screens from React Navigation to Expo Router. The app structure has been set up with file-based routing, and you now need to update the individual screens to use the new navigation APIs.

## Project Structure

The new file-based routing structure:

```
app/
├── _layout.tsx                 # Root layout with providers
├── (tabs)/
│   ├── _layout.tsx             # Tab navigator
│   ├── (home)/
│   │   ├── _layout.tsx         # Home stack navigator
│   │   ├── index.tsx           # Home screen
│   │   ├── board-ark.tsx
│   │   ├── send-to.tsx
│   │   ├── transactions.tsx
│   │   ├── transaction-detail.tsx
│   │   ├── boarding-transactions.tsx
│   │   └── boarding-transaction-detail.tsx
│   ├── receive.tsx
│   ├── send.tsx
│   └── settings/
│       ├── _layout.tsx         # Settings stack navigator
│       ├── index.tsx           # Settings list
│       ├── mnemonic.tsx
│       ├── logs.tsx
│       ├── lightning-address.tsx
│       ├── backup-settings.tsx
│       ├── vtxos.tsx
│       └── vtxo-detail.tsx
└── (onboarding)/
    ├── _layout.tsx             # Onboarding stack navigator
    ├── index.tsx               # Onboarding screen
    ├── configuration.tsx
    ├── mnemonic.tsx
    ├── restore-wallet.tsx
    └── lightning-address.tsx
```

## Migration Steps for Each Screen

### 1. Update Imports

Replace React Navigation imports with Expo Router:

**Before:**
```typescript
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { HomeStackParamList } from "../Navigators";
```

**After (Option 1 - Direct Expo Router):**
```typescript
import { useRouter, useLocalSearchParams } from "expo-router";
```

**After (Option 2 - Using Migration Hook):**
```typescript
import { useAppNavigation } from "~/hooks/useAppNavigation";
```

### 2. Update Navigation Usage

#### Option 1: Direct Expo Router (Recommended for new code)

**Before:**
```typescript
const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
navigation.navigate("BoardArk");
navigation.push("Send", { destination: value });
navigation.goBack();
```

**After:**
```typescript
const router = useRouter();
router.push("/(tabs)/(home)/board-ark");
router.push(`/(tabs)/(home)/send-to?destination=${encodeURIComponent(value)}`);
router.back();
```

#### Option 2: Using Migration Hook (Easier migration)

**Before:**
```typescript
const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
navigation.navigate("BoardArk");
navigation.push("Send", { destination: value });
navigation.goBack();
```

**After:**
```typescript
const navigation = useAppNavigation();
navigation.navigate("BoardArk");
navigation.push("Send", { destination: value });
navigation.goBack();
```

### 3. Update Route Parameters

**Before:**
```typescript
// In the navigating screen
navigation.navigate("TransactionDetail", { transaction: txData });

// In the receiving screen
const route = useRoute<RouteProp<HomeStackParamList, "TransactionDetail">>();
const { transaction } = route.params;
```

**After (Direct Expo Router):**
```typescript
// In the navigating screen
router.push(`/(tabs)/(home)/transaction-detail?transaction=${encodeURIComponent(JSON.stringify(txData))}`);

// In the receiving screen
const params = useLocalSearchParams();
const transaction = params.transaction ? JSON.parse(params.transaction as string) : null;
```

**After (Using Migration Hook):**
```typescript
// In the navigating screen
navigation.navigate("TransactionDetail", { transaction: txData });

// In the receiving screen
const { params } = useAppNavigation();
const { transaction } = params;
```

## Screen-by-Screen Migration Checklist

### Screens that need updating:

- [ ] `BoardArkScreen.tsx`
  - Replace navigation imports
  - Update `navigation.goBack()` → `router.back()` or `navigation.goBack()`
  - Update `navigation.navigate("BoardingTransactions")` → `router.push("/(tabs)/(home)/boarding-transactions")`

- [ ] `BoardingTransactionsScreen.tsx`
  - Replace navigation imports
  - Update `navigation.navigate("BoardingTransactionDetail", { transaction })` 
  - Update `navigation.goBack()`

- [ ] `BoardingTransactionDetailScreen.tsx`
  - Replace navigation imports and route imports
  - Update parameter access from `route.params`
  - Update `navigation.goBack()`

- [ ] `SendScreen.tsx`
  - Replace navigation imports and route imports
  - Access `destination` param from `useLocalSearchParams()`
  - Update `navigation.goBack()`

- [ ] `ReceiveScreen.tsx`
  - Replace navigation imports
  - Update `navigation.goBack()`

- [ ] `TransactionsScreen.tsx`
  - Replace navigation imports
  - Update navigation to `TransactionDetail`
  - Update `navigation.goBack()`

- [ ] `TransactionDetailScreen.tsx`
  - Replace navigation and route imports
  - Update parameter access
  - Update `navigation.goBack()`

- [ ] `MnemonicScreen.tsx`
  - Replace navigation and route imports
  - Access `fromOnboarding` param
  - Update conditional navigation based on `fromOnboarding`

- [ ] `LightningAddressScreen.tsx`
  - Replace navigation and route imports
  - Access `fromOnboarding` param
  - Update conditional navigation

- [ ] `LogScreen.tsx`
  - Replace navigation imports
  - Update `navigation.goBack()`

- [ ] `BackupSettingsScreen.tsx`
  - Replace navigation imports
  - Update `navigation.goBack()`

- [ ] `VTXOsScreen.tsx`
  - Replace navigation imports
  - Update navigation to `VTXODetail`
  - Update `navigation.goBack()`

- [ ] `VTXODetailScreen.tsx`
  - Replace navigation and route imports
  - Access `vtxo` param
  - Update `navigation.goBack()`

- [ ] `OnboardingScreen.tsx`
  - Replace navigation imports
  - Update `navigation.navigate("Mnemonic", { fromOnboarding: true })`
  - Update `navigation.navigate("RestoreWallet")`

- [ ] `RestoreWalletScreen.tsx`
  - Replace navigation imports
  - Update `navigation.goBack()`

## Route Mapping Reference

| Old Navigation | New Expo Router Path |
|----------------|---------------------|
| `HomeStack` | `/(tabs)/(home)` |
| `BoardArk` | `/(tabs)/(home)/board-ark` |
| `Send` | `/(tabs)/(home)/send-to` |
| `Transactions` | `/(tabs)/(home)/transactions` |
| `TransactionDetail` | `/(tabs)/(home)/transaction-detail` |
| `BoardingTransactions` | `/(tabs)/(home)/boarding-transactions` |
| `BoardingTransactionDetail` | `/(tabs)/(home)/boarding-transaction-detail` |
| `ReceiveStack` | `/(tabs)/receive` |
| `SendStack` | `/(tabs)/send` |
| `SettingsList` | `/(tabs)/settings` |
| `Mnemonic` | `/(tabs)/settings/mnemonic` or `/(onboarding)/mnemonic` |
| `Logs` | `/(tabs)/settings/logs` |
| `LightningAddress` | `/(tabs)/settings/lightning-address` or `/(onboarding)/lightning-address` |
| `BackupSettings` | `/(tabs)/settings/backup-settings` |
| `VTXOs` | `/(tabs)/settings/vtxos` |
| `VTXODetail` | `/(tabs)/settings/vtxo-detail` |
| `Onboarding` | `/(onboarding)` |
| `Configuration` | `/(onboarding)/configuration` |
| `RestoreWallet` | `/(onboarding)/restore-wallet` |

## Testing the Migration

1. **Test navigation flows:**
   - Onboarding flow (create wallet, restore wallet)
   - Tab navigation
   - Deep linking into stacks
   - Back button behavior
   - Parameter passing between screens

2. **Common issues to check:**
   - Ensure parameters are properly encoded/decoded
   - Verify conditional navigation (onboarding vs main app)
   - Check that back navigation works correctly
   - Ensure wallet initialization state properly switches between onboarding and main app

## Benefits of Migration

1. **File-based routing:** Routes are defined by file structure
2. **Type safety:** Better TypeScript support with typed routes
3. **Deep linking:** Automatic deep linking support
4. **Web compatibility:** Better web support if needed in the future
5. **Simpler navigation:** No need to manually define navigators
6. **Better developer experience:** Hot reload works better with file-based routing

## Next Steps

1. Update all remaining screens following the patterns above
2. Remove the old `Navigators.tsx` file
3. Update `App.tsx` to use the Expo Router entry point
4. Test all navigation flows thoroughly
5. Update any deep linking configurations if needed