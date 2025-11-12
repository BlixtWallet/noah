# Android Widgets Setup Summary

## What Was Implemented

Android home screen widgets for Noah Wallet that display balance information across all three app variants (regtest, signet, mainnet).

## Files Created

### Widget Providers (Kotlin)
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetProvider.kt` - Base provider with shared logic
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetRegtestProvider.kt` - Regtest variant
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetSignetProvider.kt` - Signet variant
- `client/android/app/src/main/java/com/noahwallet/widgets/NoahWidgetMainnetProvider.kt` - Mainnet variant

### Layouts (XML)
- `client/android/app/src/main/res/layout/widget_noah.xml` - Main widget layout
- `client/android/app/src/main/res/drawable/widget_background.xml` - Dark background shape
- `client/android/app/src/main/res/drawable/badge_background.xml` - Badge background shape

### Widget Configuration (XML)
- `client/android/app/src/main/res/xml/noah_widget_regtest_info.xml` - Regtest widget metadata
- `client/android/app/src/main/res/xml/noah_widget_signet_info.xml` - Signet widget metadata
- `client/android/app/src/main/res/xml/noah_widget_mainnet_info.xml` - Mainnet widget metadata

### Modified Files
- `client/nitromodules/noah-tools/android/src/main/java/com/margelo/nitro/noahtools/NoahTools.kt` - Added widget data saving
- `client/android/app/src/main/AndroidManifest.xml` - Registered widget receivers
- `client/android/app/src/main/res/values/strings.xml` - Added widget descriptions
- `client/src/hooks/useWidget.ts` - Updated to support Android

## How It Works

1. **Data Saving**: When balance changes, React Native calls `saveBalanceForWidget()` which stores data in SharedPreferences
2. **Widget Update**: A broadcast is sent to trigger widget refresh
3. **Widget Rendering**: Widget providers read from SharedPreferences and update RemoteViews
4. **Periodic Updates**: Widgets refresh every 15 minutes automatically

## Testing

### Build and Install
```bash
cd noah
bun android:regtest:debug  # or signet/mainnet
```

### Add Widget
1. Long press on home screen
2. Tap "Widgets"
3. Find "Noah Wallet" widgets
4. Drag to home screen
5. Choose widget for your installed variant

### Verify Updates
1. Open the app
2. Pull to refresh on home screen
3. Go back to home screen
4. Widget should show updated balance

## Differences from iOS

| Feature | iOS | Android |
|---------|-----|---------|
| UI Framework | SwiftUI | XML + RemoteViews |
| Data Storage | App Groups | SharedPreferences |
| Update Trigger | WidgetCenter | BroadcastReceiver |
| Styling | Native SwiftUI | XML drawables |
| Dynamic Colors | Widget tinting modes | Material You support |

## Limitations

- Android widgets use XML layouts (less flexible than SwiftUI)
- RemoteViews support limited set of views
- No interactive elements (Android 12+ supports some interactivity)
- Updates triggered by app, not widget itself

## Future Enhancements

- Support for different widget sizes (currently optimized for 2x2 grid)
- Material You dynamic color theming
- Tap to open app to specific screen
- Support for Android 12+ interactive widgets