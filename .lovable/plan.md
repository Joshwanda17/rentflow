# Welile Android APK (side-loadable wrapper)

Goal: a signed `Welile.apk` that anyone can download from welileapp.com, install, and use as a real app icon on their phone — while the app content stays exactly the live welileapp.com you already publish.

## What we build

A thin Android shell (Capacitor) whose only job is to open `https://welileapp.com` fullscreen, with the Welile icon, splash screen and status-bar colour. No second copy of the app, no duplicated screens.

```text
Phone taps Welile icon
        |
Android shell (APK, signed)  ->  loads https://welileapp.com
        |                                   |
 native back button,               your existing React app,
 splash, icon, file picker         Lovable Cloud backend, SMS, wallet
```

Because the shell loads the live site, every future release you publish appears in the APK immediately. You only rebuild the APK when the icon, name, permissions or Android settings change.

## Work items

1. Add Capacitor (core, cli, android) and `capacitor.config.ts` with:
   - appId `com.welile.app`, appName `Welile`
   - `server.url = "https://welileapp.com"`, `androidScheme: "https"`
   - allow-navigation for welileapp.com, welilereceipts.com and the backend host so auth and API calls are never blocked
2. Android app icons + splash generated from `public/icon-512.png`, theme `#7c3aed`.
3. `AndroidManifest` permissions: internet, camera (ID/receipt photos), fine location (agent GPS), notifications, storage read for uploads. Nothing more — extra permissions scare users and complicate Play later.
4. Native back-button handling so back navigates web history instead of closing the app; exit only at the app root.
5. App Links / deep links for welileapp.com so invite links (`/pa/:code`, activation, password reset) open in the app when installed.
6. A small in-app version check: the shell reads a version file on the site and shows a "New version available – download" notice, since side-loaded APKs get no automatic updates.
7. A public download page at `/download` with the APK, file size, SHA-256 checksum, and clear "allow install from this source" instructions for Android 8-15.
8. Store the APK as a static asset served from the site so the link never expires.

## What you do on your laptop (once per APK release)

1. Export the project to GitHub, `git pull`, `npm install`
2. `npx cap add android`, `npm run build`, `npx cap sync`
3. In Android Studio: create the **release keystore once** and back it up forever — losing it means you can never ship an update under the same app identity.
4. Build > Generate Signed Bundle/APK > APK > release. Rename the result `welile-<version>.apk`.
5. Send me the file and I add it to the download page with its checksum.

## Implications — the honest assessment

**Good**
- Real app icon, fullscreen, no browser bar; feels like a bank app and raises trust with landlords and agents.
- No Play review, no USD 25 account, no data-safety questionnaire — live in days.
- One codebase. Web releases reach app users instantly.
- Camera, GPS and push work better than in a mobile browser.
- You can send the download link straight to agents on WhatsApp.

**Costs and risks**
- **Trust friction on install.** Android shows "unknown source" warnings and Play Protect may flag it. Some users abandon here. The checksum + instructions page reduces this but cannot remove it.
- **No automatic updates.** Only the in-app version notice; users must download again for shell changes.
- **APK re-sharing.** The file will circulate. Old copies keep working and still hit the live site, so security stays server-side — which it already is (RLS, role checks). Nothing sensitive is baked into the APK.
- **Keystore is a single point of failure.** Losing it forces a new app identity and a fresh install for everyone.
- **Offline behaviour.** A remote-URL wrapper needs a connection; with no network it shows an offline screen. True offline field capture would be a much larger project and is not in this plan.
- **iPhone users are not covered.** iOS side-loading is not possible; they keep the existing "Add to Home Screen" install.
- **Play Store later.** The same project submits to Play with mostly metadata work, but Play requires an App Bundle and rejects pure webview wrappers under the minimum-functionality policy unless there is real native integration — our camera/GPS/push/deep-link work is what makes it pass.
- **Financial-app scrutiny.** Since Welile moves money, keep the download page, privacy policy and terms visible from the app.

**Not affected**
- Backend, wallet logic, ledger, SMS, email, RLS — untouched. This is purely a delivery channel.

## Recommendation

Ship the wrapper APK for side-loading now with the download page, checksum and version notice, keep the PWA install for iPhone, and treat the Play Store as a separate follow-up once agent adoption proves demand.