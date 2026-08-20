import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  /// Covers the app's content with a blur any time it stops being the
  /// focused app — the app-switcher snapshot iOS takes in
  /// applicationWillResignActive would otherwise show whatever vault
  /// screen was on-screen (every screen here can show vault contents,
  /// same reasoning as Android's FLAG_SECURE in MainActivity.kt).
  private var privacyOverlay: UIVisualEffectView?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    excludeMmkvDirectoryFromBackup()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "Flintlock",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  /// react-native-mmkv stores both the vault and preferences instances
  /// under Documents/mmkv (see node_modules/react-native-mmkv/ios/
  /// HybridMMKVPlatformContext.swift), which iCloud/iTunes back up by
  /// default. Vault content there is already our own AES-256-GCM
  /// ciphertext, never plaintext, but the spec's "no cloud backup"
  /// invariant means the file shouldn't leave the device via backup at
  /// all, encrypted or not. Created proactively (rather than only
  /// excluded if it already exists) so the flag is set before MMKV's
  /// first write on a fresh install, not racing it.
  private func excludeMmkvDirectoryFromBackup() {
    guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    var mmkvURL = documentsURL.appendingPathComponent("mmkv", isDirectory: true)

    if !FileManager.default.fileExists(atPath: mmkvURL.path) {
      try? FileManager.default.createDirectory(at: mmkvURL, withIntermediateDirectories: true)
    }

    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    try? mmkvURL.setResourceValues(resourceValues)
  }

  func applicationWillResignActive(_ application: UIApplication) {
    guard let window = window, privacyOverlay == nil else { return }
    let overlay = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
    overlay.frame = window.bounds
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    window.addSubview(overlay)
    privacyOverlay = overlay
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    privacyOverlay?.removeFromSuperview()
    privacyOverlay = nil
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
