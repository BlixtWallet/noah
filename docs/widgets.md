# Mobile Widgets Implementation

## Overview

Noah Wallet includes home screen widgets for both iOS and Android that display wallet balance information. The widgets are available for all three app variants (regtest, signet, mainnet) and support multiple sizes.

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
- Supports iOS 18 widget rendering modes (fullColor, tinted, vibrant)

**Android:**
All Android widgets share a base provider in `NoahWidgetProvider.kt` with variant-specific implementations.

## Data Flow

1. React Native app saves balance data using `saveBalanceForWidget()` from `noah-tools` Nitro module
2. Data is stored in shared container (App Groups on iOS, SharedPreferences on Android)
3. Widget reads data from shared container and displays it
4. Widget refreshes every 15 minutes or when manually triggered
5. Tapping widget opens the main app (iOS: automatic, Android: PendingIntent)

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

## iOS Implementation

### Files Created

**Shared Widget Code:**
- `client/ios/SharedWidget/NoahBalanceWidget.swift` - Shared implementation for all widgets

**Widget Extensions:**
- `client/ios/NoahWidgetRegtest/NoahWidgetRegtest.swift` - Regtest widget entry point
- `client/ios/NoahWidgetSignet/NoahWidgetSignet.swift` - Signet widget entry point
- `client/ios/NoahWidgetMainnet/NoahWidgetMainnet.swift` - Mainnet widget entry point

**Nitro Module:**
- `client/nitromodules/noah-tools/ios/NoahToolsWidget.swift` - Native data saving logic

### Setup Requirements

1. Create widget extension targets in Xcode
2. Set up App Groups capability for each variant
3. Link WidgetKit framework to main app targets
4. Add NoahToolsWidget.swift to all main app targets

### Key Features

- SwiftUI-based UI with semantic fonts for accessibility
- Supports small and medium widget sizes
- iOS 18 widget rendering mode support (adapts to tinted/clear modes)
- Static NumberFormatter for performance
- Graceful date calculation fallback

## Android Implementation

### Files Created

**Widget Providers:**
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetProvider.kt` - Base provider
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetRegtestProvider.kt` - Regtest
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetSignetProvider.kt` - Signet
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetMainnetProvider.kt` - Mainnet

**Layouts & Resources:**
- `client/android/app/src/main/res/layout/widget_noah.xml` - Widget layout
- `client/android/app/src/main/res/drawable/widget_background.xml` - Dark background
- `client/android/app/src/main/res/drawable/badge_background.xml` - Yellow badge (regtest)
- `client/android/app/src/main/res/drawable/badge_background_orange.xml` - Orange badge (signet)

**Widget Configuration:**
- `client/android/app/src/main/res/xml/noah_widget_regtest_info.xml` - Regtest metadata
- `client/android/app/src/main/res/xml/noah_widget_signet_info.xml` - Signet metadata
- `client/android/app/src/main/res/xml/noah_widget_mainnet_info.xml` - Mainnet metadata

**Variant-Specific Manifests:**
- `client/android/app/src/regtest/AndroidManifest.xml` - Removes other widgets from regtest
- `client/android/app/src/signet/AndroidManifest.xml` - Removes other widgets from signet
- `client/android/app/src/mainnet/AndroidManifest.xml` - Removes other widgets from mainnet

### Setup Requirements

1. Widget providers registered in main AndroidManifest.xml
2. Variant-specific manifests filter widgets per build
3. PendingIntent configured for tap-to-open
4. Broadcast receiver handles widget updates

### Key Features

- XML-based layouts with RemoteViews
- Material Design dark theme
- Variant filtering via manifest merging
- PendingIntent for launching app on tap
- Supports 2x2 grid widget size

## Key Files

### React Native
- `client/src/hooks/useWidget.ts` - Hook for updating widget data (iOS + Android)
- `client/nitromodules/noah-tools/src/NoahTools.nitro.ts` - Type definitions

### Modified Files
- `client/nitromodules/noah-tools/android/src/main/java/com/margelo/nitro/noahtools/NoahTools.kt` - Android implementation
- `client/nitromodules/noah-tools/ios/NoahTools.swift` - iOS implementation
- `client/android/app/src/main/AndroidManifest.xml` - Widget receiver registration
- `client/android/app/src/main/res/values/strings.xml` - Widget descriptions

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

Or manually update:

```typescript
updateWidget({
  totalBalance: 100000,
  onchainBalance: 50000,
  offchainBalance: 50000,
  pendingBalance: 0,
});
```

## Features

### Badge Colors
- **Regtest**: Yellow badge (#FFEB3B) on both platforms
- **Signet**: Orange badge (#FF9800) on both platforms
- **Mainnet**: No badge on either platform

### Variant Filtering
Each build variant only shows its corresponding widget in the picker, preventing confusion.

### Widget Sizes
- **iOS**: Small (systemSmall) and Medium (systemMedium)
- **Android**: 2x2 grid (180dp × 110dp minimum)

### Tap to Open
Tapping any widget opens the main Noah Wallet app.

### iOS 18 Support
iOS widgets adapt to rendering modes:
- **Full Color**: Bright yellow/orange badges
- **Tinted/Clear**: Semi-transparent badges that blend with system tinting

## Testing

### iOS

**Build and Install:**
```bash
cd noah
bun ios:regtest:debug  # or signet/mainnet
```

**Add Widget:**
1. Long press on home screen
2. Tap the "+" button
3. Search for "Noah"
4. Select "Noah Balance"
5. Choose size and add

**Verify Updates:**
1. Open app and pull to refresh
2. Go back to home screen
3. Widget shows updated balance

### Android

**Build and Install:**
```bash
cd noah
bun android:regtest:debug  # or signet/mainnet
```

**Add Widget:**
1. Long press on home screen
2. Tap "Widgets"
3. Find "Noah Wallet" widgets
4. Drag to home screen
5. Only the variant-specific widget appears

**Verify Updates:**
1. Open app and pull to refresh
2. Go back to home screen
3. Widget shows updated balance

**Verify Tap to Open:**
1. Tap the widget
2. App opens to main screen

**Verify Variant Filtering:**
1. Build regtest - only regtest widget appears
2. Build signet - only signet widget appears
3. Build mainnet - only mainnet widget appears

## Platform Differences

| Feature | iOS | Android |
|---------|-----|---------|
| UI Framework | SwiftUI | XML + RemoteViews |
| Data Storage | App Groups (UserDefaults) | SharedPreferences |
| Update Trigger | WidgetCenter.reloadAllTimelines() | BroadcastReceiver |
| Styling | Native SwiftUI modifiers | XML drawables |
| Dynamic Colors | Widget tinting modes (iOS 18) | Material You (future) |
| Tap Action | Built-in navigation | PendingIntent |
| Accessibility | Dynamic Type support | Standard Android scaling |
| Size Variants | systemSmall, systemMedium | Grid-based (dp) |

## Adding New Variants

### iOS
1. Create new widget extension in Xcode
2. Set up App Group in entitlements for main app and widget
3. Create widget Swift file importing `NoahBalanceWidget`
4. Configure variant name and color in widget
5. Update `useWidget.ts` with new App Group identifier
6. Add WidgetKit framework to main app target

### Android
1. Create new widget provider extending `NoahWidgetProvider`
2. Override `appGroup`, `variantName`, and `badgeBackgroundResId`
3. Create badge background drawable if needed
4. Create widget info XML in `res/xml/`
5. Register receiver in main AndroidManifest.xml
6. Create variant-specific manifest to filter other widgets
7. Update `useWidget.ts` with new SharedPreferences key

## Limitations

### iOS
- Widgets update every 15 minutes (system limit)
- Limited to small and medium sizes currently
- No interactive elements (tap opens app only)

### Android
- XML layouts less flexible than SwiftUI
- RemoteViews support limited set of views
- No interactive elements (Android 12+ supports some)
- Updates triggered by app, not widget itself
- Currently optimized for 2x2 grid only

## Future Enhancements

### iOS
- Support for large widget size
- Lock screen widgets (iOS 16+)
- StandBy mode optimization (iOS 17+)
- Interactive widgets (iOS 17+)

### Android
- Material You dynamic color theming
- Support for different widget sizes (3x2, 4x2, etc.)
- Deep links to specific screens (tap onchain → receive screen)
- Android 12+ interactive widgets (buttons)
- Widget configuration activity for customization
- Glanceable widget (Android 12+)