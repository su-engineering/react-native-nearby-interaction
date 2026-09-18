#import "RNNearbyInteraction.h"
#import "NearbyInteractionKit-Swift.h"

@implementation RNNearbyInteraction {
  NIController *_controller;
}
+ (NSString *)moduleName { return @"NearbyInteraction"; }
+ (BOOL)requiresMainQueueSetup { return NO; }
- (instancetype)init {
  if ((self = [super init])) {
    _controller = [NIController new];
    __weak RNNearbyInteraction *weakSelf = self;
    _controller.onEvent = ^(NSDictionary *event) { [weakSelf emitOnEvent:event]; };
  }
  return self;
}
- (void)getCapabilities:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{ resolve([self->_controller capabilities]); });
}
- (void)start:(NSString *)runId options:(NSString *)options resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSError *error = nil;
    if ([self->_controller startWithRunId:runId options:options error:&error]) resolve(nil);
    else reject(error.userInfo[@"code"] ?: @"START_FAILED", error.localizedDescription, error);
  });
}
- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{ [self->_controller stop]; resolve(nil); });
}
- (void)configureAccessory:(NSString *)runId configuration:(NSString *)configuration bluetoothPeerId:(NSString *)bluetoothPeerId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSError *error = nil;
    if ([self->_controller configureWithRunId:runId data:configuration peerId:bluetoothPeerId error:&error]) resolve(nil);
    else reject(error.userInfo[@"code"] ?: @"CONFIGURATION_FAILED", error.localizedDescription, error);
  });
}
- (void)sendData:(NSString *)runId data:(NSString *)data resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_controller sendWithRunId:runId data:data completion:^(NSError *error) {
      if (error) reject(error.userInfo[@"code"] ?: @"WRITE_FAILED", error.localizedDescription, error);
      else resolve(nil);
    }];
  });
}
- (void)invalidate {
  NIController *controller = _controller;
  dispatch_async(dispatch_get_main_queue(), ^{ controller.onEvent = nil; [controller stop]; });
}
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeNearbyInteractionSpecJSI>(params);
}
@end
