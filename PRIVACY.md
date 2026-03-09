# Privacy Policy — AskInline

**Last updated:** March 9, 2026

AskInline is a Firefox extension that integrates Google's Gemini AI into your browser context menu. Your privacy is important — here's exactly what we do and don't do.

## Data Collection

**AskInline does NOT collect any personal data.** We do not use analytics, telemetry, or tracking of any kind.

## Data Storage

The following data is stored **locally in your browser** via `browser.storage.sync`:
- Your Gemini API Key (encrypted by the browser)
- Your preferred AI model name
- Your default language preference
- Your theme preference

Position and size of the AskInline popup window are stored in `browser.storage.local` and remain on your device.

**No data is stored on any external server.**

## Data Transmission

When you use AskInline, the following data is sent **directly to Google's Gemini API** (`generativelanguage.googleapis.com`):
- The text you selected on the webpage
- The image you right-clicked (if applicable)
- Your follow-up prompts
- Your API Key (for authentication with Google)

This communication happens directly between your browser and Google's servers. **AskInline does not operate or proxy through any intermediate server.**

For Google's data handling, refer to the [Google API Terms of Service](https://developers.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy).

## Permissions

AskInline uses the following browser permissions:
- **`activeTab`**: To interact with the content of the current tab when you invoke AskInline
- **`contextMenus`**: To add "AskInline" entries to the right-click menu
- **`storage`**: To save your settings locally

## Third-Party Services

The only third-party service used is the **Google Gemini API**. No other third-party services, SDKs, or analytics tools are included.

## Open Source

AskInline is open source under the MIT License. You can review the complete source code at [github.com/liamtoaldo/AskInline](https://github.com/liamtoaldo/AskInline).

## Contact

For questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/liamtoaldo/AskInline/issues).
