import SwiftUI
import WidgetKit

struct NoahWidgetRegtest: Widget {
    let kind: String = "NoahWidgetRegtest"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: BalanceProvider(appGroup: "group.com.noahwallet.regtest")
        ) { entry in
            if #available(iOS 17.0, *) {
                NoahBalanceWidgetView(
                    entry: entry,
                    variantName: "REGTEST",
                    variantColor: .yellow
                )
                .containerBackground(Color(red: 0.05, green: 0.05, blue: 0.05), for: .widget)
            } else {
                NoahBalanceWidgetView(
                    entry: entry,
                    variantName: "REGTEST",
                    variantColor: .yellow
                )
            }
        }
        .configurationDisplayName("Noah Balance")
        .description("View your Bitcoin balance on regtest")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct NoahWidgetRegtestBundle: WidgetBundle {
    var body: some Widget {
        NoahWidgetRegtest()
    }
}

#Preview(as: .systemSmall) {
    NoahWidgetRegtest()
} timeline: {
    BalanceEntry(
        date: .now, totalBalance: 100000, onchainBalance: 50000, offchainBalance: 50000,
        pendingBalance: 0, closestExpiryBlocks: 500, expiryThreshold: 288)
    BalanceEntry(
        date: .now, totalBalance: 250000, onchainBalance: 100000, offchainBalance: 150000,
        pendingBalance: 10000, closestExpiryBlocks: 150, expiryThreshold: 288)
}
