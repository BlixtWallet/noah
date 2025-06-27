#import "AppVariant.h"

@implementation AppVariant

RCT_EXPORT_MODULE();

- (NSDictionary *)constantsToExport
{
  NSString *appVariant = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"APP_VARIANT"];
  return @{ @"APP_VARIANT": appVariant };
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end