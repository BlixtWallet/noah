project(noahtools)
cmake_minimum_required(VERSION 3.9.0)

set(PACKAGE_NAME noahtools)
set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)

add_compile_definitions(CPPHTTPLIB_OPENSSL_SUPPORT)

add_library(
    ${PACKAGE_NAME}
    SHARED
    src/main/cpp/cpp-adapter.cpp
    ../cpp/HybridNoahToolsCpp.cpp
)

include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/noahtools+autolinking.cmake)

include_directories("src/main/cpp" "../cpp")

find_library(LOG_LIB log)
find_package(OpenSSL REQUIRED)

target_link_libraries(
    ${PACKAGE_NAME}
    ${LOG_LIB}
    android
    OpenSSL::SSL
    OpenSSL::Crypto
)
