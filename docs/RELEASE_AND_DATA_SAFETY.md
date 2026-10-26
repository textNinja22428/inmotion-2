# IN MOTION Android release safety

The Android application ID is `com.inmotion.personalagenda.v21`. The CI workflow caches its
**debug signing keystore** under the `in-motion-debug-signing-v1` cache key.
This improves signing continuity across subsequent debug builds while that cache is retained,
but is not a substitute for a permanently backed-up, confidential production release keystore.

Older APKs were signed using different, ephemeral debug keys. Android will reject an
in-place update from those versions. **Never uninstall an existing IN MOTION app before
safely exporting its app-private data**, which may contain journal notes, pictures, videos,
project tasks, preferences, local WebView storage, and AI pairing configuration.

To migrate from older builds on a Windows development PC:
1. Install Google's Android Platform Tools and enable USB debugging.
2. Back up the app's complete private data with `adb exec-out run-as` and a tar stream.
3. Validate the backup archive before uninstalling the app.
4. Install the new APK, then restore the full backup into the new app data directory.
5. Verify the saved journal and images before discarding the backup.

`IN_MOTION_SAFE_UPGRADE.cmd` is an optional on-device migration helper distributed
separately with the 3.3.1 stable APK. Do not run it without an explicit user confirmation.

For production-grade releases use a securely stored, permanent release keystore with
restricted access and a recovery plan, rather than relying indefinitely on CI cache.

The GitHub debug build explicitly points Gradle's signing configuration at
`$HOME/.android/debug.keystore` to prevent Android Gradle Plugin from
silently generating or selecting a different debug key. CI must fail rather
than produce an unsigned APK if the expected key cannot be read.
