import Foundation
import WidgetKit

extension NoahTools {
    func performSaveBalanceForWidget(
        totalBalance: Double,
        onchainBalance: Double,
        offchainBalance: Double,
        pendingBalance: Double,
        appGroup: String
    ) throws {
        guard let userDefaults = UserDefaults(suiteName: appGroup) else {
            throw NSError(
                domain: "NoahTools",
                code: 1001,
                userInfo: [NSLocalizedDescriptionKey: "Failed to access App Group: \(appGroup)"]
            )
        }

        let balanceData: [String: Any] = [
            "totalBalance": totalBalance,
            "onchainBalance": onchainBalance,
            "offchainBalance": offchainBalance,
            "pendingBalance": pendingBalance,
            "lastUpdated": Date().timeIntervalSince1970,
        ]

        userDefaults.set(balanceData, forKey: "widgetBalance")

        // Trigger widget refresh
        WidgetCenter.shared.reloadAllTimelines()
    }
}
