# Mobile Widgets Implementation

## Overview

Noah Wallet includes home screen widgets for both iOS and Android that display wallet balance information. The widgets are available for all three app variants (regtest, signet, mainnet) and support both small and medium sizes.

## Architecture

### iOS Widget Extensions
- **NoahWidgetRegtest** - Widget for regtest variant
- **NoahWidgetSignet** - Widget for signet variant  
- **NoahWidgetMainnet** - Widget for mainnet variant

Each widget extension is a separate target in Xcode with its own App Group for data sharing.

### Android Widget Providers
- **NoahWidgetRegtestProvider** - Widget for regtest variant
- **NoahWidgetSignetProvider** - Widget for signet variant
- **NoahWidgetMainnetProvider** - Widget for mainnet variant

Each widget provider extends `AppWidgetProvider` and is registered in AndroidManifest.xml.

### Shared Code

**iOS:**
All iOS widgets share common implementation in `client/ios/SharedWidget/NoahBalanceWidget.swift`:
- `BalanceProvider` - Fetches balance data from App Group shared container
- `NoahBalanceWidgetView` - Renders widget UI with size-specific layouts

**Android:**
All Android widgets share a base provider in `NoahWidgetProvider.kt` with variant-specific implementations.

### Data Flow
1. React Native app saves balance data using `saveBalanceForWidget()` from `noah-tools` Nitro module
2. Data is stored in App Group shared UserDefaults container
3. Widget reads data from shared container and displays it
4. Widget refreshes every 15 minutes or when manually triggered

## Data Sharing

### iOS - App Groups
Each variant uses its own App Group for data isolation:
- Regtest: `group.com.noahwallet.regtest`
- Signet: `group.com.noahwallet.signet`
- Mainnet: `group.com.noahwallet.mainnet`

### Android - SharedPreferences
Each variant uses its own SharedPreferences key:
- Regtest: `com.noahwallet.regtest`
- Signet: `com.noahwallet.signet`
- Mainnet: `com.noahwallet.mainnet`
</text>

<old_text line=33>
## Key Files

### Native (iOS)
- `client/ios/SharedWidget/NoahBalanceWidget.swift` - Shared widget implementation
- `client/ios/NoahWidget*/NoahWidget*.swift` - Per-variant widget configuration
- `client/nitromodules/noah-tools/ios/NoahToolsWidget.swift` - Native data saving logic

### React Native
- `client/src/hooks/useWidget.ts` - Hook for updating widget data
- `client/nitromodules/noah-tools/src/NoahTools.nitro.ts` - Type definitions

## Key Files

### Native (iOS)
- `client/ios/SharedWidget/NoahBalanceWidget.swift` - Shared widget implementation
- `client/ios/NoahWidget*/NoahWidget*.swift` - Per-variant widget configuration
- `client/nitromodules/noah-tools/ios/NoahToolsWidget.swift` - Native data saving logic

### React Native
- `client/src/hooks/useWidget.ts` - Hook for updating widget data
- `client/nitromodules/noah-tools/src/NoahTools.nitro.ts` - Type definitions

## Usage

The `useWidget` hook automatically updates widget data when balance changes:

```typescript
useWidget(
  balance
    ? {
        totalBalance,
        onchainBalance,
        offchainBalance,
        pendingBalance,
      }
    : null,
);
```

## Adding New Variants

### iOS
1. Create new widget extension in Xcode
2. Set up App Group in entitlements
3. Create widget file importing `NoahBalanceWidget`
4. Update `useWidget.ts` with new App Group identifier
5. Add WidgetKit framework to main app target

### Android
1. Create new widget provider extending `NoahWidgetProvider`
2. Create widget info XML in `res/xml/`
3. Register receiver in AndroidManifest.xml
4. Update `useWidget.ts` with new SharedPreferences key
5. Update NoahTools.kt to handle new variant