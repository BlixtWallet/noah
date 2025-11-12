import SwiftUI
import WidgetKit

struct BalanceEntry: TimelineEntry {
    let date: Date
    let totalBalance: Double
    let onchainBalance: Double
    let offchainBalance: Double
    let pendingBalance: Double
}

class BalanceProvider: TimelineProvider {
    let appGroup: String

    init(appGroup: String) {
        self.appGroup = appGroup
    }

    func placeholder(in context: Context) -> BalanceEntry {
        BalanceEntry(
            date: Date(),
            totalBalance: 0,
            onchainBalance: 0,
            offchainBalance: 0,
            pendingBalance: 0
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceEntry) -> Void) {
        let entry = loadBalanceEntry()
        completion(entry)
    }

    func getTimeline(
        in context: Context, completion: @escaping (Timeline<BalanceEntry>) -> Void
    ) {
        let entry = loadBalanceEntry()

        // Refresh every 15 minutes
        let nextUpdate =
            Calendar.current.date(byAdding: .minute, value: 15, to: Date())
            ?? Date().addingTimeInterval(15 * 60)
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))

        completion(timeline)
    }

    private func loadBalanceEntry() -> BalanceEntry {
        guard let userDefaults = UserDefaults(suiteName: appGroup),
            let balanceData = userDefaults.dictionary(forKey: "widgetBalance")
        else {
            return BalanceEntry(
                date: Date(),
                totalBalance: 0,
                onchainBalance: 0,
                offchainBalance: 0,
                pendingBalance: 0
            )
        }

        return BalanceEntry(
            date: Date(),
            totalBalance: balanceData["totalBalance"] as? Double ?? 0,
            onchainBalance: balanceData["onchainBalance"] as? Double ?? 0,
            offchainBalance: balanceData["offchainBalance"] as? Double ?? 0,
            pendingBalance: balanceData["pendingBalance"] as? Double ?? 0
        )
    }
}

struct NoahBalanceWidgetView: View {
    var entry: BalanceEntry
    var variantName: String?
    var variantColor: Color?
    @Environment(\.widgetFamily) var family

    private static let numberFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter
    }()

    var body: some View {
        if family == .systemSmall {
            smallWidgetLayout
        } else {
            mediumWidgetLayout
        }
    }

    private var smallWidgetLayout: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text("Noah Wallet")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                Spacer(minLength: 4)
                if let variantName = variantName, let variantColor = variantColor {
                    Text(variantName)
                        .font(.caption2)
                        .fontWeight(.bold)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(variantColor)
                        .foregroundColor(.black)
                        .cornerRadius(3)
                }
            }

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 3) {
                Text("\(formatSatsCompact(entry.totalBalance))")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)

                Text("sats")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(.gray)

                if entry.pendingBalance > 0 {
                    Text("Pending: \(formatSatsCompact(entry.pendingBalance))")
                        .font(.caption2)
                        .foregroundColor(.yellow)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("On")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text("\(formatSatsCompact(entry.onchainBalance))")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.8)
                        .lineLimit(1)
                }

                Spacer(minLength: 4)

                VStack(alignment: .trailing, spacing: 1) {
                    Text("Off")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text("\(formatSatsCompact(entry.offchainBalance))")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.8)
                        .lineLimit(1)
                }
            }
        }
        .padding(12)
    }

    private var mediumWidgetLayout: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Noah Wallet")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                Spacer()
                if let variantName = variantName, let variantColor = variantColor {
                    Text(variantName)
                        .font(.caption2)
                        .fontWeight(.bold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(variantColor)
                        .foregroundColor(.black)
                        .cornerRadius(4)
                }
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
        .padding(14)
    }

    private func formatSats(_ value: Double) -> String {
        return Self.numberFormatter.string(from: NSNumber(value: value)) ?? "0"
    }

    private func formatSatsCompact(_ value: Double) -> String {
        if value >= 1_000_000 {
            // 1M+ sats - show as "1.5M" format
            let millions = value / 1_000_000
            return String(format: "%.1fM", millions)
        } else if value >= 100_000 {
            // 100K+ sats - show as "123K" format
            let thousands = value / 1_000
            return String(format: "%.0fK", thousands)
        } else if value >= 10_000 {
            // 10K+ sats - show as "12.3K" format
            let thousands = value / 1_000
            return String(format: "%.1fK", thousands)
        } else {
            // Less than 10K - show full number
            return formatSats(value)
        }
    }
}
