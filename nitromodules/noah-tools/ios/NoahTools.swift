import Foundation

class NoahTools: HybridNoahToolsSpec {
  func getAppVariant() throws -> String {
    guard let appVariant = Bundle.main.object(
      forInfoDictionaryKey: "APP_VARIANT"
    ) as? String else {
      throw NSError(
        domain: "NoahTools",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "NoahTools: Can't find Info.plist key APP_VARIANT. " +
            "Is the xcconfig file for the current schema properly set?"
        ]
      )
    }
    return appVariant
  }
}
