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
#include <fstream>

#ifdef __APPLE__
#include "CertPathHelper.hpp"
#endif

namespace margelo::nitro::noahtools {

static std::string getCACertPath() {
#ifdef __APPLE__
  return getIOSCACertPath();
#elif defined(__ANDROID__)
  return "/system/etc/security/cacerts";
#else
  return "";
#endif
}

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

template<typename ClientType>
static HttpResponse executeRequest(
  ClientType& client,
  const std::string& path,
  const std::string& method,
  const std::string& body,
  const std::unordered_map<std::string, std::string>& headers
) {
  httplib::Headers httpHeaders;
  for (const auto& [key, value] : headers) {
    httpHeaders.emplace(key, value);
  }

  httplib::Result res;

  if (method == "POST") {
    res = client.Post(path, httpHeaders, body, "application/json");
  } else if (method == "GET") {
    res = client.Get(path, httpHeaders);
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

static HttpResponse performRequest(
  const std::string& url,
  const std::string& method,
  const std::string& body,
  const std::unordered_map<std::string, std::string>& headers,
  double timeoutSeconds
) {
  auto parsed = parseUrl(url);

  if (parsed.scheme == "https") {
#ifdef CPPHTTPLIB_OPENSSL_SUPPORT
    httplib::SSLClient client(parsed.host, parsed.port);
    client.set_read_timeout(static_cast<long>(timeoutSeconds), 0);
    client.set_write_timeout(static_cast<long>(timeoutSeconds), 0);
    client.enable_server_certificate_verification(true);

    std::string certPath = getCACertPath();
    if (!certPath.empty()) {
      client.set_ca_cert_path("", certPath.c_str());
    }

    return executeRequest(client, parsed.path, method, body, headers);
#else
    throw std::runtime_error("HTTPS not supported");
#endif
  } else {
    httplib::Client client(parsed.host, parsed.port);
    client.set_read_timeout(static_cast<long>(timeoutSeconds), 0);
    client.set_write_timeout(static_cast<long>(timeoutSeconds), 0);
    return executeRequest(client, parsed.path, method, body, headers);
  }
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
