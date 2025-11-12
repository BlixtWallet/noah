import SwiftUI
import WidgetKit

struct BalanceEntryMainnet: TimelineEntry {
    let date: Date
    let totalBalance: Double
    let onchainBalance: Double
    let offchainBalance: Double
    let pendingBalance: Double
}

struct BalanceProviderMainnet: TimelineProvider {
    let appGroup = "group.com.noahwallet.mainnet"

    func placeholder(in context: Context) -> BalanceEntryMainnet {
        BalanceEntryMainnet(
            date: Date(),
            totalBalance: 0,
            onchainBalance: 0,
            offchainBalance: 0,
            pendingBalance: 0
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceEntryMainnet) -> Void) {
        let entry = loadBalanceEntry()
        completion(entry)
    }

    func getTimeline(
        in context: Context, completion: @escaping (Timeline<BalanceEntryMainnet>) -> Void
    ) {
        let entry = loadBalanceEntry()

        // Refresh every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))

        completion(timeline)
    }

    private func loadBalanceEntry() -> BalanceEntryMainnet {
        guard let userDefaults = UserDefaults(suiteName: appGroup),
            let balanceData = userDefaults.dictionary(forKey: "widgetBalance")
        else {
            return BalanceEntryMainnet(
                date: Date(),
                totalBalance: 0,
                onchainBalance: 0,
                offchainBalance: 0,
                pendingBalance: 0
            )
        }

        return BalanceEntryMainnet(
            date: Date(),
            totalBalance: balanceData["totalBalance"] as? Double ?? 0,
            onchainBalance: balanceData["onchainBalance"] as? Double ?? 0,
            offchainBalance: balanceData["offchainBalance"] as? Double ?? 0,
            pendingBalance: balanceData["pendingBalance"] as? Double ?? 0
        )
    }
}

struct NoahWidgetMainnetEntryView: View {
    var entry: BalanceProviderMainnet.Entry

    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.05, blue: 0.05)

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Noah Wallet")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    Spacer()
                }

                Spacer()

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(formatSats(entry.totalBalance)) sats")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)

                    if entry.pendingBalance > 0 {
                        Text("Pending: \(formatSats(entry.pendingBalance)) sats")
                            .font(.caption2)
                            .foregroundColor(.yellow)
                    }
                }

                Spacer()

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Onchain")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text("\(formatSats(entry.onchainBalance))")
                            .font(.caption)
                            .foregroundColor(.white)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Offchain")
                            .font(.caption2)
                            .foregroundColor(.gray)
                        Text("\(formatSats(entry.offchainBalance))")
                            .font(.caption)
                            .foregroundColor(.white)
                    }
                }
            }
            .padding()
        }
    }

    private func formatSats(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "0"
    }
}

struct NoahWidgetMainnet: Widget {
    let kind: String = "NoahWidgetMainnet"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceProviderMainnet()) { entry in
            if #available(iOS 17.0, *) {
                NoahWidgetMainnetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                NoahWidgetMainnetEntryView(entry: entry)
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
    BalanceEntryMainnet(
        date: .now, totalBalance: 100000, onchainBalance: 50000, offchainBalance: 50000,
        pendingBalance: 0)
    BalanceEntryMainnet(
        date: .now, totalBalance: 250000, onchainBalance: 100000, offchainBalance: 150000,
        pendingBalance: 10000)
}
