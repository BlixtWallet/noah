import SwiftUI
import WidgetKit

struct NoahWidgetSignet: Widget {
    let kind: String = "NoahWidgetSignet"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: BalanceProvider(appGroup: "group.com.noahwallet.signet")
        ) { entry in
            if #available(iOS 17.0, *) {
                NoahBalanceWidgetView(
                    entry: entry,
                    variantName: "SIGNET",
                    variantColor: .orange
                )
                .containerBackground(Color(red: 0.05, green: 0.05, blue: 0.05), for: .widget)
            } else {
                NoahBalanceWidgetView(
                    entry: entry,
                    variantName: "SIGNET",
                    variantColor: .orange
                )
            }
        }
        .configurationDisplayName("Noah Balance")
        .description("View your Bitcoin balance on signet")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct NoahWidgetSignetBundle: WidgetBundle {
    var body: some Widget {
        NoahWidgetSignet()
    }
}

#Preview(as: .systemSmall) {
    NoahWidgetSignet()
} timeline: {
    BalanceEntry(
        date: .now, totalBalance: 100000, onchainBalance: 50000, offchainBalance: 50000,
        pendingBalance: 0, closestExpiryBlocks: 500, expiryThreshold: 288)
    BalanceEntry(
        date: .now, totalBalance: 250000, onchainBalance: 100000, offchainBalance: 150000,
        pendingBalance: 10000, closestExpiryBlocks: 150, expiryThreshold: 288)
}
