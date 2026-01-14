# Lazarus Privacy Policy

**Last updated:** January 2026

Lazarus is a passive form recovery extension that saves your typing locally. This document explains exactly what data we collect, how it's stored, and what we explicitly do NOT do.

---

## Summary

- ✅ **All data stays on your device** — nothing is sent to external servers
- ✅ **No analytics, tracking, or telemetry**
- ✅ **Passwords and sensitive fields are never captured**
- ✅ **PIN protection with industry-standard hashing**
- ✅ **You can delete all data at any time**

---

## What Data We Collect

### Form Input Text
Lazarus monitors text input in form fields to enable recovery. For each captured field, we store:

| Data | Purpose |
|------|---------|
| **Text content** | The actual text you typed (for recovery) |
| **Field label** | Human-readable name (e.g., "Email", "Message") |
| **Website hostname** | To organize entries by site (e.g., "mail.google.com") |
| **Page path** | To distinguish different pages on the same site |
| **Field selector** | Technical identifier to recognize the same field |
| **Timestamp** | When the text was saved |

### PIN Hash
Your 4-digit PIN is never stored directly. We store only:
- A cryptographic hash (SHA-256) of your PIN combined with a random salt
- The random salt used for hashing

---

## What We Do NOT Collect

### Sensitive Fields — Explicitly Excluded
Lazarus **never captures** the following field types:

| Field Type | How We Detect It |
|------------|------------------|
| **Passwords** | `type="password"` attribute |
| **Credit card numbers** | `autocomplete="cc-number"` and name pattern matching |
| **CVV/Security codes** | `autocomplete="cc-csc"` and name patterns like `cvv`, `cvc`, `security-code` |
| **Card expiration** | `autocomplete="cc-exp"`, `cc-exp-month`, `cc-exp-year` |
| **Cardholder name** | `autocomplete="cc-name"`, `cc-given-name`, `cc-family-name` |
| **Bank account/routing numbers** | Name patterns like `routing`, `account-num`, `bank` |
| **Social Security Numbers** | Name patterns like `ssn`, `social-security` |
| **One-time passwords** | `autocomplete="one-time-code"` and patterns like `otp`, `2fa`, `totp`, `verification-code` |
| **New/current passwords** | `autocomplete="new-password"`, `current-password"` |
| **Hidden fields** | `type="hidden"` |
| **File uploads** | `type="file"` |
| **Buttons** | `type="submit"`, `type="button"`, `type="reset"` |

We detect sensitive fields by checking:
1. The `type` attribute
2. The `autocomplete` attribute
3. The `name` attribute against sensitive patterns
4. The `id` attribute against sensitive patterns
5. The `aria-label` attribute against sensitive patterns
6. The `placeholder` attribute against sensitive patterns

### No Network Communication
Lazarus makes **zero network requests**. Specifically:
- ❌ No data sent to our servers (we don't have servers)
- ❌ No analytics or crash reporting services
- ❌ No third-party APIs or SDKs
- ❌ No remote configuration fetching
- ❌ No update checks beyond Chrome's built-in extension updates

### No Tracking
- ❌ No user identification or fingerprinting
- ❌ No usage analytics
- ❌ No advertising IDs
- ❌ No cross-site tracking

---

## Data Storage

### Location
All data is stored locally on your device using Chrome's `chrome.storage.local` API. Data is:
- Stored in Chrome's extension storage (sandboxed to this extension)
- Never synced to Google's servers (we don't use `chrome.storage.sync`)
- Never accessible to websites or other extensions

### Storage Limit
- Maximum storage: **5 MB**
- When storage reaches 90% capacity, the oldest entries are automatically deleted (LRU eviction)
- Each field stores up to 10 versions of text

### Encryption
- Your data is protected by your 4-digit PIN
- The PIN is hashed using **SHA-256** with a random 16-byte salt
- The actual PIN is never stored — only the hash
- Session authentication is stored in memory only and cleared when you close the side panel

---

## Permissions Explained

Lazarus requests only the minimum permissions needed:

| Permission | Why We Need It |
|------------|----------------|
| `storage` | To save your form data locally on your device |
| `sidePanel` | To display the recovery interface in Chrome's side panel |

### Host Permissions
- `<all_urls>` — Required to monitor form inputs on any website you visit. This is essential for a form recovery tool to function. We only read input events; we do not modify page content or inject ads.

---

## Your Controls

### View Your Data
Open the Lazarus side panel to see all saved entries, searchable and sorted by time.

### Delete Individual Entries
Hover over any entry and click the delete icon to remove it permanently.

### Delete All Data
Go to Settings → "Clear All Data" to permanently delete all saved form data.

### Reset PIN
Go to Settings → "Reset PIN" to clear your PIN and set a new one.

### Uninstall
Uninstalling the extension removes all stored data from your device.

---

## Data Retention

- Data is retained locally until you delete it or storage limits trigger automatic cleanup
- No data is retained on external servers (there are none)
- Uninstalling the extension deletes all data

---

## Children's Privacy

Lazarus does not knowingly collect data from children under 13. The extension functions identically for all users and does not request age information.

---

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last updated" date at the top. Significant changes will be noted in the extension's changelog.

---

## Open Source

Lazarus is open source. You can audit the complete source code to verify these privacy claims:
- Content script: `src/content/index.js` — see exactly what fields are monitored and excluded
- Storage: `src/utils/storage.js` — see how data is stored locally
- Crypto: `src/utils/crypto.js` — see how PIN hashing works

---

## Contact

For privacy questions or concerns, please open an issue on our GitHub repository.

---

## Technical Reference

### Sensitive Field Detection Patterns

The following regex pattern is used to detect and exclude sensitive fields:

```
/\b(password|passwd|pwd|pin|cvv|cvc|csc|ccv|credit.?card|card.?number|cc.?num|security.?code|expir|exp.?date|exp.?month|exp.?year|ssn|social.?security|routing|account.?num|bank|otp|2fa|totp|verification.?code|auth.?code)\b/i
```

### Sensitive Autocomplete Values

Fields with these `autocomplete` values are never captured:

```
cc-name, cc-given-name, cc-additional-name, cc-family-name,
cc-number, cc-exp, cc-exp-month, cc-exp-year, cc-csc, cc-type,
transaction-currency, transaction-amount,
new-password, current-password, one-time-code
```

### Ignored Input Types

```
password, hidden, submit, button, file, image, reset
```
