import SwiftUI
import WidgetKit

struct NoahWidgetMainnet: Widget {
    let kind: String = "NoahWidgetMainnet"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: BalanceProvider(appGroup: "group.com.noahwallet.mainnet")
        ) { entry in
            if #available(iOS 17.0, *) {
                NoahBalanceWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                NoahBalanceWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Noah Balance")
        .description("View your Bitcoin balance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct NoahWidgetMainnetBundle: WidgetBundle {
    var body: some Widget {
        NoahWidgetMainnet()
    }
}

#Preview(as: .systemSmall) {
    NoahWidgetMainnet()
} timeline: {
    BalanceEntry(
        date: .now, totalBalance: 100000, onchainBalance: 50000, offchainBalance: 50000,
        pendingBalance: 0)
    BalanceEntry(
        date: .now, totalBalance: 250000, onchainBalance: 100000, offchainBalance: 150000,
        pendingBalance: 10000)
}
