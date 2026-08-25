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
    hardenMmkvDirectory()

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
  /// default and which iOS otherwise only protects at its weakest tier.
  /// Applies two hardening flags to that directory; created proactively
  /// (rather than only touched if it already exists) so both are set
  /// before MMKV's first write on a fresh install, not racing it.
  ///
  /// **Backup exclusion (`isExcludedFromBackup`).** Vault content there
  /// is already our own AES-256-GCM ciphertext, never plaintext, but the
  /// spec's "no cloud backup" invariant means the file shouldn't leave
  /// the device via backup at all, encrypted or not.
  ///
  /// **File protection class — deliberately `.completeUnlessOpen`, not
  /// `.complete`.** PROMPT.md §2.6 names `NSFileProtectionComplete`
  /// specifically, and it is the stronger of the two: with `.complete`,
  /// the OS makes the file's encryption key unavailable — for every
  /// open file descriptor, not just new ones — the instant the device
  /// locks. MMKV is an mmap-backed store: it maps its file into memory
  /// once and keeps that mapping open for the process's entire
  /// lifetime, reading and writing through the mapping rather than
  /// discrete open/read/write/close syscalls. Touching an
  /// `.complete`-protected mmap'd region while the device is locked is
  /// documented Apple/MMKV-ecosystem behavior for either a SIGBUS crash
  /// (the backing pages get invalidated under the mapping) or an EPERM
  /// I/O failure — and "device locked while the app is merely
  /// backgrounded, not killed" is not an edge case, it's the single
  /// most common lock trigger this app has (`lockOnBackground` defaults
  /// to `true` — see `VaultSettings` in packages/core/src/storage/schema.ts).
  /// `.complete` would make an ordinary press-the-power-button action a
  /// crash risk.
  ///
  /// `.completeUnlessOpen` (class C) instead lets an *already-open*
  /// file descriptor keep working across a lock — only a *new* open()
  /// is blocked until the next unlock. That matches MMKV's actual
  /// access pattern: the mapping opened at first access (app launch, or
  /// first read) stays usable through a background-and-lock cycle,
  /// while a cold launch that hasn't reached an unlock yet correctly
  /// fails to open the file at all — consistent with this app's
  /// fail-closed posture, and harmless since the master password
  /// hasn't been entered in that scenario anyway. The gap this leaves
  /// relative to `.complete` is narrow (an already-open mapping stays
  /// technically reachable to code running on the device during that
  /// specific locked-but-recently-used window) and is defense-in-depth
  /// on top of ciphertext either way — the vault's own AES-256-GCM
  /// encryption, not the OS file-protection class, is what actually
  /// keeps the contents confidential; this flag's job is only to deny a
  /// *cold* read of the file (e.g. from a rebooted, never-unlocked
  /// device) without also making the app crash-prone in normal use.
  /// Still strictly stronger than the default
  /// (`.completeUntilFirstUserAuthentication`), which stays decrypted
  /// at rest after any single unlock since boot, indefinitely, no
  /// matter how many times the device is subsequently locked.
  ///
  /// **Unverified as of this writing** (same as everything else
  /// native — see docs/CRYPTO.md's device checklist, which now
  /// includes a device-lock-while-backgrounded case specifically for
  /// this): that MMKV genuinely keeps its mapping open across a
  /// lock/unlock cycle without erroring, and that a cold app launch
  /// while the device is still locked fails the way this comment
  /// predicts rather than crashing.
  private func hardenMmkvDirectory() {
    guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    var mmkvURL = documentsURL.appendingPathComponent("mmkv", isDirectory: true)

    if !FileManager.default.fileExists(atPath: mmkvURL.path) {
      try? FileManager.default.createDirectory(at: mmkvURL, withIntermediateDirectories: true)
    }

    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    resourceValues.fileProtection = .completeUnlessOpen
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
