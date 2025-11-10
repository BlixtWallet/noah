//
//  HybridNoahToolsCpp.hpp
//  NoahTools
//
//  Created by Nitro
//  Copyright © 2025 Margelo. All rights reserved.
//

#pragma once

#include "HybridNoahToolsCppSpec.hpp"
#include <NitroModules/Promise.hpp>
#include <memory>
#include <string>
#include <unordered_map>

namespace margelo::nitro::noahtools {

using namespace margelo::nitro;

class HybridNoahToolsCpp : public HybridNoahToolsCppSpec {
public:
  HybridNoahToolsCpp() : HybridObject(TAG) {}

public:
  std::shared_ptr<Promise<HttpResponse>> nativePost(
    const std::string& url,
    const std::string& body,
    const std::unordered_map<std::string, std::string>& headers,
    double timeoutSeconds
  ) override;

  std::shared_ptr<Promise<HttpResponse>> nativeGet(
    const std::string& url,
    const std::unordered_map<std::string, std::string>& headers,
    double timeoutSeconds
  ) override;

  void loadHybridMethods() override;

private:
  static constexpr auto TAG = "NoahToolsCpp";
};

} // namespace margelo::nitro::noahtools