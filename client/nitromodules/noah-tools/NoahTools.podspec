require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NoahTools"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => ".git", :tag => "#{s.version}" }


  s.source_files = [
    "ios/**/*.{swift}",
    "ios/**/*.{m,mm}",
    "cpp/**/*.{hpp,cpp,mm}",
  ]

  s.resources = ["cpp/cacert.pem"]

  s.pod_target_xcconfig = {
    # C++ compiler flags, mainly for folly.
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) FOLLY_NO_CONFIG FOLLY_CFG_NO_COROUTINES CPPHTTPLIB_OPENSSL_SUPPORT"
  }

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  s.dependency 'ZIPFoundation'
  s.dependency 'OpenSSL-Universal'

  load 'nitrogen/generated/ios/NoahTools+autolinking.rb'
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
