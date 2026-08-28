# Snooker Scores

Snooker scoreboard for clubs and players. Live frame scoring, automatic break
tracking, a fullscreen TV scoreboard, and per-player statistics.

Runs as an Android app (Capacitor) and as a web app from the same source.
Works fully offline — no account, no server, no subscription.

---

## Requirements

- Node.js 20 or newer
- For local Android builds: Android Studio and JDK 21
  (not needed if you let GitHub Actions build the APK for you)

## Run it in a browser

```bash
npm install
npm run dev
```

## Build the Android app

```bash
npm run sync      # builds web assets and copies them into the native project
npm run android   # opens the project in Android Studio
```

Then press Run in Android Studio, or build an APK from the command line:

```bash
cd android
./gradlew assembleDebug
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

## Let GitHub build the APK for you

Push to `main`. The **Build APK** workflow produces `snooker-score.apk` in the
run's Artifacts. Download it, copy it to your phone, open it, and allow
installs from that source when Android asks.

Tag a version to publish a permanent download link instead:

```bash
git tag v1.0.0 && git push --tags
```

That attaches the APK to a GitHub Release — a stable URL you can send to club
members rather than asking them to dig through CI runs.

## Signing (do this once, before you share the app)

Without a keystore the workflow still builds a working APK, but it is signed
with a throwaway debug key that **changes on every build**. Android treats a
changed signature as a different app, so each new version fails to install
until the old one is uninstalled — which also wipes the match statistics.

Create your own key once and that problem disappears:

```bash
keytool -genkey -v -keystore release.keystore -alias snooker \
  -keyalg RSA -keysize 2048 -validity 10000
```

Back that file up somewhere safe and keep it out of the repository —
`.gitignore` already blocks `*.keystore` and `*.jks`. It is also the same key
you would need later for a Play Store listing, so losing it is expensive.

Then add four repository secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | output of `base64 -w0 release.keystore` |
| `SIGNING_STORE_PASSWORD` | keystore password |
| `SIGNING_KEY_ALIAS` | `snooker` |
| `SIGNING_KEY_PASSWORD` | key password |

Every build afterwards is properly signed and installs cleanly over the last one.

## Updating the app

There is no store, so there are no automatic updates: pushing a new APK does
not reach phones on its own. Send out the Release link when you publish a
version. `versionCode` is bumped automatically by CI, so installs over an
existing copy keep all local statistics.

## Project layout

```
index.html              app shell
src/app.js              scoring engine, match state, all rendering
src/style.css           design system and layout
src/native.js           Android glue: back button, status bar, orientation
capacitor.config.json   app id and name
android/                native project (generated, safe to commit)
.github/workflows/      APK build pipeline
```

## Android behaviour

- **Back button** closes a dialog, exits TV mode, or asks before abandoning a
  match — it never silently discards a frame in progress.
- **Screen stays awake** while a match is on screen.
- **TV mode** goes fullscreen and locks landscape (on the web it opens a
  second window instead, for a club TV on the same machine).

## Data

Everything is stored on the device. Statistics are written when a match
finishes; an in-progress match survives a restart. Uninstalling the app
removes the data, so treat it as local until a sync backend is added.

## Scoring model

The app is referee-driven: you tap what was potted, and it keeps the totals,
breaks, reds remaining, points remaining and snookers required. It does not
enforce rules such as which ball is legally on after a foul, which matches how
club scorers actually work.
