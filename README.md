<p align="center">
  <img src="icons/icon128.svg" alt="Lazarus" width="80" height="80" />
</p>

<h1 align="center">Lazarus</h1>

<p align="center">
  <strong>Form recovery, on autopilot.</strong>
  <br />
  <em>Never lose your work to a crash, refresh, or accidental close again.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/chrome-extension-green?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Extension" />
  <img src="https://img.shields.io/badge/license-MIT-purple?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

---

## ✨ What is Lazarus?

Lazarus is a **passive, zero-configuration** Chrome extension that automatically saves everything you type in web forms. Whether you're writing an email, filling out a long application, or composing a social media post — Lazarus has your back.

- 🔄 **Automatic** — No save buttons, no manual backups. Just type.
- 🔒 **Private** — All data stays on your device. Nothing leaves your browser.
- ⚡ **Lightweight** — Zero overhead design with minimal resource usage.
- 🎨 **Beautiful** — Modern, sleek dark UI that stays out of your way.

---

## 🖼️ Screenshots

<p align="center">
  <em>Side panel with saved form entries</em>
</p>

```
┌─────────────────────────────────┐
│  LAZARUS                    ⚙️  │
│  ┌─────────────────────────┐    │
│  │ 🔍 Search...            │   │
│  └─────────────────────────┘   │
│                                 │
│  ● Message · gmail.com          │
│    Hey! Just wanted to follow   │
│    up on our conversation...    │
│                            2m   │
│                                 │
│  ○ Comment · github.com         │
│    This looks great! I think    │
│    we should also consider...   │
│                           15m   │
│                                 │
│  ○ Bio · twitter.com            │
│    Software engineer building   │
│    tools for developers...      │
│                            1h   │
│                                 │
├─────────────────────────────────┤
│  2.1% storage    3 entries      │
└─────────────────────────────────┘
```

---

## 🚀 Features

### 🚪 PIN Lock
A 4-digit PIN keeps casual eyes out — like a lock screen, not a vault. It prevents someone from casually opening the side panel and seeing your data, but isn't designed to withstand determined attacks.

### 🔍 Fuzzy Search
Quickly find any saved text with instant fuzzy search powered by Fuse.js. Search by content, field label, or website.

### 📜 Version History
Lazarus keeps up to 10 versions per field, so you can recover not just the latest text, but earlier drafts too.

### 🕵️ Sensitive Field Detection
Automatically ignores passwords, credit card numbers, SSNs, and other sensitive fields. Your private data stays private.

### 🌐 Shadow DOM Support
Works with modern web apps like Gmail, Notion, and Slack that use Shadow DOM for their editors.

### 📊 Smart Storage Management
Automatic LRU (Least Recently Used) eviction ensures you never hit storage limits. Oldest data is cleaned up first.

---

## 📦 Installation

### From Source (Developer Mode)

1. **Clone the repository**
   ```bash
   git clone https://github.com/roopen219/lazarus.git
   cd lazarus
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Build the extension**
   ```bash
   bun run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `dist` folder

5. **Open the side panel**
   - Click the Lazarus icon in your toolbar
   - Set your 4-digit PIN
   - Start typing anywhere — Lazarus is now watching!

---

## 🛠️ Development

### Prerequisites
- [Bun](https://bun.sh/) (v1.0+)
- Chrome browser

### Commands

```bash
# Install dependencies
bun install

# Start development server with HMR
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

### Hot Module Replacement

During development, changes to the side panel will hot-reload automatically. For content script changes, you'll need to reload the extension from `chrome://extensions/`.

---

## 🏗️ Architecture

```
src/
├── background/
│   └── index.js      # Service worker: throttling, diffing, storage
├── content/
│   └── index.js      # Content script: event capture, field detection
├── sidepanel/
│   ├── index.html    # Minimal mount point
│   ├── index.js      # Mithril.js UI components
│   └── styles.css    # Tailwind + custom styles
└── utils/
    ├── storage.js    # Chrome storage API, LRU eviction
    └── crypto.js     # PIN hashing with Web Crypto API
```

### How It Works

```
┌─────────────┐    input event    ┌─────────────────┐    throttled    ┌──────────────┐
│   Web Page  │ ───────────────▶  │  Content Script │ ─────────────▶  │   Background │
│  (any form) │                   │  (capture phase)│                 │    Worker    │
└─────────────┘                   └─────────────────┘                 └──────┬───────┘
                                                                             │
                                                                    Levenshtein diff
                                                                             │
                                                                             ▼
┌─────────────┐   real-time       ┌─────────────────┐    stored      ┌──────────────┐
│  Side Panel │ ◀──────────────── │  storage.onChange│ ◀──────────── │ chrome.storage│
│    (UI)     │     updates       │    listener     │                │    .local    │
└─────────────┘                   └─────────────────┘                └──────────────┘
```

1. **Capture**: A single event listener with `{ capture: true }` intercepts all input events, even through Shadow DOM via `composedPath()`.

2. **Throttle**: The background worker throttles saves to 1 per second per field, with a trailing call to capture the final state.

3. **Diff**: Levenshtein distance determines if a change is "significant" (≥10 characters different). Minor edits update the existing version; major changes create a new version.

4. **Store**: Data is stored in `chrome.storage.local` with automatic LRU eviction at 90% capacity.

5. **Display**: The side panel listens to `storage.onChanged` for real-time updates. Virtual scrolling handles 10,000+ entries smoothly.

---

## 🔐 Privacy & Data Handling

### What Lazarus Does

| Aspect | Details |
|--------|---------|
| **Data Location** | `chrome.storage.local` — everything stays on your device |
| **Network Access** | None — the extension has zero network permissions |
| **Sensitive Fields** | Automatically detected and skipped (see below) |
| **XSS Prevention** | Mithril.js virtual DOM — no innerHTML anywhere |

### What Lazarus Ignores

- Password fields (`type="password"`)
- Credit card fields (`autocomplete="cc-*"`)
- One-time codes and 2FA inputs
- SSN and bank account fields
- Any field matching sensitive name patterns

### About the PIN

The PIN is a **casual deterrent**, not encryption. It's designed to:

✅ Stop someone from glancing at your saved data  
✅ Add a "please knock first" barrier to the UI  

It is **not** designed to:

❌ Protect against someone with access to your browser's storage  
❌ Withstand any serious attempt to access the data  

The underlying form data is stored unencrypted in `chrome.storage.local`. If you need actual security for sensitive information, Lazarus isn't the right tool — and that's by design. It's a convenience utility for recovering lost drafts, not a secrets manager.

---

## 📊 Data Schema

```json
{
  "gmail.com": {
    "/mail/u/0/": {
      "div[aria-label=\"Message Body\"]": {
        "label": "Message Body",
        "lastUpdated": 1704560500,
        "versions": [
          { "ts": 1704560000, "text": "Hey! Just wanted to..." },
          { "ts": 1704560500, "text": "Hey! Just wanted to follow up..." }
        ]
      }
    }
  }
}
```

---

## 🎨 Design System

Lazarus uses a **modern slate + emerald** color scheme:

| Element | Color |
|---------|-------|
| Background | `slate-950` (#020617) |
| Cards | `slate-900` with transparency |
| Borders | `slate-800` |
| Primary Text | `slate-100` — `slate-300` |
| Muted Text | `slate-500` — `slate-600` |
| Accent | `emerald-600` (#059669) |
| Error | `red-400` |

---

## 🧰 Tech Stack

| Category | Technology |
|----------|------------|
| **Build** | [Vite](https://vitejs.dev/) + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin/) |
| **UI Framework** | [Mithril.js](https://mithril.js.org/) (~10KB) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) |
| **Font** | [Geist Sans](https://vercel.com/font) |
| **Search** | [Fuse.js](https://fusejs.io/) |
| **Dates** | [Luxon](https://moment.github.io/luxon/) |
| **Diffing** | [fast-levenshtein](https://github.com/hiddentao/fast-levenshtein) |
| **Utilities** | [lodash-es](https://lodash.com/) (throttle) |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with ☕ and a fear of losing unsaved work.</sub>
</p>
