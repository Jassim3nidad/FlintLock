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

  /// Holds the observer registered in `startReactNativeWhenDataIsAvailable`
  /// so it can be removed once it fires (or on a second launch call, which
  /// shouldn't happen but shouldn't leak an observer if it somehow does).
  private var protectedDataObserver: NSObjectProtocol?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    startReactNativeWhenDataIsAvailable(application, factory: factory, launchOptions: launchOptions)

    return true
  }

  /// Defers starting the JS bundle — and therefore MMKV's first,
  /// storage-touching effects (`VaultSessionProvider`'s mount effect reads
  /// vault storage almost immediately after the React tree renders) —
  /// until iOS confirms Data-Protection-protected files are actually
  /// readable.
  ///
  /// Without this, a background "prewarming" launch (iOS can start this
  /// app with zero user interaction — launch-time-optimization prewarming,
  /// silent push handling, background refresh — including while the
  /// device has never been unlocked this boot) would call
  /// `factory.startReactNative()` unconditionally, rendering the full
  /// React tree and attempting to open the vault's MMKV file almost
  /// immediately. Under `NSFileProtectionCompleteUnlessOpen` (see
  /// `hardenMmkvDirectory()`), a *first* open while locked is denied —
  /// and `react-native-mmkv`'s failure mode for a denied open is not
  /// guaranteed to be a catchable JS exception; MMKV's native core has a
  /// documented history of hard process aborts on iOS Data-Protection
  /// open failures. Checking `isProtectedDataAvailable` means the risky
  /// `mmap()` attempt never happens in the first place during exactly
  /// that window, rather than depending on it failing gracefully after
  /// the fact — which is the more robust half of this fix; the JS side
  /// (`apps/mobile/src/storage/native.ts`) separately makes its own MMKV
  /// access lazy and catches what *is* catchable, as defense in depth,
  /// not as the primary guard.
  ///
  /// **No bounded timeout that falls through to starting React Native
  /// anyway — deliberately.** An earlier version of this guard considered
  /// exactly that ("wait N seconds, then start regardless"), but that
  /// would reintroduce the same crash risk this guard exists to remove:
  /// if the timeout fires while data is *still* unavailable, React Native
  /// still starts, `VaultSessionProvider` still touches storage almost
  /// immediately, and the risky open still isn't guaranteed to fail as a
  /// catchable JS exception — a bounded wait doesn't bound the *risk*,
  /// only the *time before hitting it*. Instead: never leave the launch
  /// screen frozen with no UI and no way out (a real prior gap in this
  /// guard) by showing a minimal *native* "Unlock your device to
  /// continue" view immediately, one that touches nothing
  /// Data-Protection-gated, in place of starting React Native at all —
  /// then waiting on `protectedDataDidBecomeAvailableNotification` for as
  /// long as it takes. That notification is the OS's own guarantee: it
  /// fires whenever the user actually unlocks the device, which is the
  /// only condition that ever makes this launch path relevant to begin
  /// with (nobody sees this screen without eventually unlocking their
  /// phone to do anything else with it either).
  ///
  /// The observer closure runs `queue: .main` — confirmed by reading the
  /// call below, not assumed — so `factory.startReactNative()` is always
  /// dispatched on the main thread regardless of which thread posts the
  /// notification.
  ///
  /// For a real, already-visible user launch, `isProtectedDataAvailable`
  /// is true essentially always — a device the user is actively looking
  /// at and interacting with has, in the overwhelming majority of real
  /// usage, already been unlocked — so this fallback view is never seen
  /// in normal use; it exists for the narrow window where it's actually
  /// needed.
  ///
  /// **Unverified as of this writing** — see `docs/CRYPTO.md`'s device
  /// checklist, which now includes a background-prewarm-while-locked
  /// case specifically for this.
  private func startReactNativeWhenDataIsAvailable(
    _ application: UIApplication,
    factory: RCTReactNativeFactory,
    launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) {
    guard let window = window else { return }

    if application.isProtectedDataAvailable {
      hardenMmkvDirectory()
      factory.startReactNative(withModuleName: "Flintlock", in: window, launchOptions: launchOptions)
      return
    }

    showWaitingForUnlockScreen(in: window)

    protectedDataObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let self = self else { return }
      if let observer = self.protectedDataObserver {
        NotificationCenter.default.removeObserver(observer)
        self.protectedDataObserver = nil
      }
      self.hardenMmkvDirectory()
      factory.startReactNative(withModuleName: "Flintlock", in: window, launchOptions: launchOptions)
    }
  }

  /// A plain, static native view — no React Native, no MMKV, nothing
  /// Data-Protection-gated — shown only while `startReactNativeWhenDataIsAvailable`
  /// is waiting on a real unlock signal. Replaced automatically once
  /// `factory.startReactNative()` runs and sets its own root view
  /// controller on the same `window`.
  private func showWaitingForUnlockScreen(in window: UIWindow) {
    let viewController = UIViewController()
    viewController.view.backgroundColor = .systemBackground

    let label = UILabel()
    label.text = "Unlock your device to continue."
    label.textAlignment = .center
    label.numberOfLines = 0
    label.translatesAutoresizingMaskIntoConstraints = false
    viewController.view.addSubview(label)

    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: viewController.view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: viewController.view.centerYAnchor),
      label.leadingAnchor.constraint(greaterThanOrEqualTo: viewController.view.leadingAnchor, constant: 24),
      label.trailingAnchor.constraint(lessThanOrEqualTo: viewController.view.trailingAnchor, constant: -24),
    ])

    window.rootViewController = viewController
    window.makeKeyAndVisible()
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
