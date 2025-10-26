//
//  HybridNoahToolsCpp.cpp
//  NoahTools
//
//  Created by Nitro
//  Copyright © 2025 Margelo. All rights reserved.
//

#include "HybridNoahToolsCpp.hpp"
#include "httplib/httplib.h"
#include <regex>
#include <stdexcept>

namespace margelo::nitro::noahtools {

struct ParsedUrl {
  std::string scheme;
  std::string host;
  int port;
  std::string path;
};

static ParsedUrl parseUrl(const std::string& url) {
  ParsedUrl result;
  
  std::regex url_regex(R"(^(https?)://([^:/]+)(?::(\d+))?(.*)$)");
  std::smatch matches;
  
  if (std::regex_match(url, matches, url_regex)) {
    result.scheme = matches[1].str();
    result.host = matches[2].str();
    
    if (matches[3].matched) {
      result.port = std::stoi(matches[3].str());
    } else {
      result.port = (result.scheme == "https") ? 443 : 80;
    }
    
    result.path = matches[4].str();
    if (result.path.empty()) {
      result.path = "/";
    }
  } else {
    throw std::runtime_error("Invalid URL format");
  }
  
  return result;
}

static HttpResponse performRequest(
  const std::string& url,
  const std::string& method,
  const std::string& body,
  const std::unordered_map<std::string, std::string>& headers,
  double timeoutSeconds
) {
  auto parsed = parseUrl(url);
  
  std::unique_ptr<httplib::Client> client;
  
  if (parsed.scheme == "https") {
#ifdef CPPHTTPLIB_OPENSSL_SUPPORT
    client = std::make_unique<httplib::Client>(parsed.host, parsed.port);
#else
    throw std::runtime_error("HTTPS not supported");
#endif
  } else {
    client = std::make_unique<httplib::Client>(parsed.host, parsed.port);
  }
  
  client->set_read_timeout(static_cast<long>(timeoutSeconds), 0);
  client->set_write_timeout(static_cast<long>(timeoutSeconds), 0);
  
  httplib::Headers httpHeaders;
  for (const auto& [key, value] : headers) {
    httpHeaders.emplace(key, value);
  }
  
  httplib::Result res;
  
  if (method == "POST") {
    res = client->Post(parsed.path, httpHeaders, body, "application/json");
  } else if (method == "GET") {
    res = client->Get(parsed.path, httpHeaders);
  } else {
    throw std::runtime_error("Unsupported HTTP method");
  }
  
  if (!res) {
    throw std::runtime_error("Request failed: " + httplib::to_string(res.error()));
  }
  
  HttpResponse response;
  response.status = static_cast<double>(res->status);
  response.body = res->body;
  
  for (const auto& [key, value] : res->headers) {
    response.headers[key] = value;
  }
  
  return response;
}

std::shared_ptr<Promise<HttpResponse>> HybridNoahToolsCpp::nativePost(
  const std::string& url,
  const std::string& body,
  const std::unordered_map<std::string, std::string>& headers,
  double timeoutSeconds
) {
  return Promise<HttpResponse>::async([url, body, headers, timeoutSeconds]() {
    return performRequest(url, "POST", body, headers, timeoutSeconds);
  });
}

std::shared_ptr<Promise<HttpResponse>> HybridNoahToolsCpp::nativeGet(
  const std::string& url,
  const std::unordered_map<std::string, std::string>& headers,
  double timeoutSeconds
) {
  return Promise<HttpResponse>::async([url, headers, timeoutSeconds]() {
    return performRequest(url, "GET", "", headers, timeoutSeconds);
  });
}

void HybridNoahToolsCpp::loadHybridMethods() {
  HybridNoahToolsCppSpec::loadHybridMethods();
}

} // namespace margelo::nitro::noahtools