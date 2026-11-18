# Cooking Rotations — Android v1.0

Standalone, offline personal cooking journal for Android. **English-language UI**. A warm, playful app where dinner is something to look forward to, not a decision-fatigue chore.

## What's inside
- Five editable starting rotations (Mexican Crunch, Breakfast Fiesta, Italian Cream, Italian Fire, Turkish Comfort), each with meal, dessert, Zero, palate note, ingredients and quick tweaks.
- Add unlimited new rotations; edit or remove existing ones; custom tweak labels.
- Date-based meal journal with a mood, notes and **multiple photos / videos** from Android's media picker.
- Device-local persistent journal in IndexedDB; stored rotations in localStorage; no accounts, ads or tracking.
- Journal history, combined media gallery, and rotation frequency story.
- Complete local backup/export and import, including photo/video data (may be large).
- Original user-provided splash artwork, `jjba_notification.mp3` opening sound, and `1118.mp4` loop background bundled in app assets.
- Quick pick-for-me, designed to keep the happy ritual simple.

## Build
Run `gradle :cooking-app:assembleDebug` with Java 17, Android SDK 35, and Gradle 8.10.2. Or push this project to a branch named `cooking-rotations-standalone` in a GitHub repository and use the GitHub Action workflow included.

Install: `adb install cooking-app/build/outputs/apk/debug/cooking-app-debug.apk`.

**Important:** keep the same Android signing certificate across builds to update without losing app data. Before uninstalling, export a backup from Settings.

## Assets
- `cooking-app/src/main/assets/splash.jpg`: user's anime cooking image
- `cooking-app/src/main/assets/1118.mp4`: compressed offline 25-second looping video background from the user-provided source
- `cooking-app/src/main/assets/jjba_notification.mp3`: user's short launch sound

User media is **not** silently copied into GitHub; if publishing this source online, only push assets you have permission to share. This ZIP includes the user's own provided assets for their personal build.
