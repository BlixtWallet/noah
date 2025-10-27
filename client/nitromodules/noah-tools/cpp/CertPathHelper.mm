//
//  CertPathHelper.mm
//  NoahTools
//
//  Created by Nitro
//  Copyright © 2025 Margelo. All rights reserved.
//

#include "CertPathHelper.hpp"
#import <Foundation/Foundation.h>

namespace margelo::nitro::noahtools {

std::string getIOSCACertPath() {
  @autoreleasepool {
    NSBundle* bundle = [NSBundle mainBundle];
    NSString* certPath = [bundle pathForResource:@"cacert" ofType:@"pem"];
    if (certPath) {
      return std::string([certPath UTF8String]);
    }
    return "";
  }
}

} // namespace margelo::nitro::noahtools
