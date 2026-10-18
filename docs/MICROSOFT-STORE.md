# Publishing WISP on the Microsoft Store

Ionity (Pty) Ltd | AEDI | Policy 986 AED

The Store route gives WISP a Microsoft-signed, SmartScreen-trusted package with automatic
updates, at no cost: since 2025/2026 both individual and **company** developer accounts are
free to register.

## 1. Create the company developer account (once)
1. Go to https://storedeveloper.microsoft.com and sign in with an Ionity work account
   (e.g. ai@ionity.today) - a business-domain e-mail speeds up verification.
2. Choose **Company**, publisher display name **Ionity (Pty) Ltd**.
3. Verify the business: enter a D-U-N-S number (free from Dun & Bradstreet), or upload the
   CIPC registration certificate. Watch e-mail for the verification result.

## 2. Reserve the name
Partner Center > Apps and games > **New product** > MSIX or PWA app > reserve **WISP**
(fall back to **WISP - Aura Wisp** if taken).

## 3. Get the package identity
Product management > **Product identity**. Copy:
- `Package/Identity/Name`      -> `WISP_STORE_IDENTITY`  (looks like `IonityPtyLtd.WISP`)
- `Package/Identity/Publisher` -> `WISP_STORE_PUBLISHER` (looks like `CN=XXXXXXXX-XXXX-...`)

## 4. Build the MSIX (on Windows)
```powershell
$env:WISP_STORE_IDENTITY  = "IonityPtyLtd.WISP"
$env:WISP_STORE_PUBLISHER = "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
npm ci
npm run dist:store        # -> dist/WISP-Store-<ver>-x64.appx and -arm64.appx  (npm run dist:store -- --test to try it without an identity)
```
No certificate is needed: the Store re-signs the package with Microsoft's certificate.

## 5. Submit
Partner Center > WISP > **Start submission**
- **Packages**: upload both .appx files.
- **Properties**: category *Utilities & tools*; privacy policy URL (WISP collects nothing -
  a short page on ionity.digital is enough).
- **Store listing**: description from README, screenshots from `docs/screenshots/`,
  1:1 logo from `build/icons/512x512.png`.
- **Restricted capability `runFullTrust`**: required by every Electron app. Justification:
  *"Desktop app that draws a click-through overlay around the active window; it reads
  window positions through the Windows API. No data leaves the device."*
- **Age rating** questionnaire, pricing **Free**, then **Submit**. Certification usually
  takes 1-3 business days.

## Notes
- In the Store build, "Start with my computer" is hidden: Windows manages start-up apps
  for MSIX (Settings > Apps > Startup).
- Keep shipping the signed/unsigned .exe from GitHub Releases for portable use; the Store
  is an additional channel.
- Outside the Store, removing the SmartScreen warning needs code signing - e.g. Azure
  Artifact Signing (formerly Trusted Signing) or a classic Authenticode certificate; the
  release workflow already signs when `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` secrets exist.
