///
/// HybridNoahToolsSpec.swift
/// This file was generated by nitrogen. DO NOT MODIFY THIS FILE.
/// https://github.com/mrousavy/nitro
/// Copyright © 2025 Marc Rousavy @ Margelo
///

import Foundation
import NitroModules

/// See ``HybridNoahToolsSpec``
public protocol HybridNoahToolsSpec_protocol: HybridObject {
  // Properties
  

  // Methods
  func getAppVariant() throws -> String
  func getAppLogs() throws -> Promise<[String]>
}

/// See ``HybridNoahToolsSpec``
public class HybridNoahToolsSpec_base {
  private weak var cxxWrapper: HybridNoahToolsSpec_cxx? = nil
  public func getCxxWrapper() -> HybridNoahToolsSpec_cxx {
  #if DEBUG
    guard self is HybridNoahToolsSpec else {
      fatalError("`self` is not a `HybridNoahToolsSpec`! Did you accidentally inherit from `HybridNoahToolsSpec_base` instead of `HybridNoahToolsSpec`?")
    }
  #endif
    if let cxxWrapper = self.cxxWrapper {
      return cxxWrapper
    } else {
      let cxxWrapper = HybridNoahToolsSpec_cxx(self as! HybridNoahToolsSpec)
      self.cxxWrapper = cxxWrapper
      return cxxWrapper
    }
  }
}

/**
 * A Swift base-protocol representing the NoahTools HybridObject.
 * Implement this protocol to create Swift-based instances of NoahTools.
 * ```swift
 * class HybridNoahTools : HybridNoahToolsSpec {
 *   // ...
 * }
 * ```
 */
public typealias HybridNoahToolsSpec = HybridNoahToolsSpec_protocol & HybridNoahToolsSpec_base
