require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
  s.name = 'NearbyInteractionKit'
  s.version = package['version']
  s.summary = package['description']
  repository_url = 'https://github.com/su-engineering/react-native-nearby-interaction'
  s.homepage = repository_url
  s.license = { :type => package['license'] }
  s.author = 'Nearby Interaction contributors'
  # Local path installation is supported. A CocoaPods release requires a
  # matching version tag and access to the private repository.
  s.source = { :git => "#{repository_url}.git", :tag => s.version.to_s }
  s.platforms = { :ios => '15.1' }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.public_header_files = 'ios/RNNearbyInteraction.h'
  s.module_name = 'NearbyInteractionKit'
  s.swift_version = '5.0'
  s.frameworks = 'NearbyInteraction', 'CoreBluetooth'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_OBJC_INTERFACE_HEADER_NAME' => 'NearbyInteractionKit-Swift.h' }
  install_modules_dependencies(s)
end
