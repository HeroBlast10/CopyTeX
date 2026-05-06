<p align="center">
  <img src="logo.png" width="128" alt="AI Chat Toolkit Logo">
</p>

<h1 align="center">AI Chat Toolkit</h1>

<p align="center">
  <strong>Supercharge your AI chats. Copy LaTeX formulas, manage custom prompts, view timelines, and backup conversations with ease.</strong>
</p>

<p align="center">
  <a href="https://github.com/HeroBlast10/AI Chat Toolkit/blob/main/AI Chat Toolkit-Chrome/LICENSE"><img src="https://img.shields.io/badge/license-MIT-7f2d9c" alt="License"></a>
  <img src="https://img.shields.io/badge/manifest-v3-7f2d9c" alt="Manifest V3">
  <img src="https://img.shields.io/badge/version-1.6.3-7f2d9c" alt="Version">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/ai-chat-toolkit-%E2%80%93-ai-chat/dnkgkjeghbgobiflkonjgnfdejoeeocg">
    <img src="https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome&logoColor=white" alt="Install on Chrome">
  </a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/copytex-%E2%80%93-%E5%8D%B3%E5%88%BB%E5%A4%8D%E5%88%B6-ai-%E5%AF%B9%E8%AF%9D%E4%B8%AD%E7%9A%84%E5%8E%9F%E5%A7%8B-/ibnmhabmikbofkccpglnippndpdepgmd">
    <img src="https://img.shields.io/badge/Microsoft-Edge-0078D7?logo=microsoftedge&logoColor=white" alt="Install on Edge">
  </a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/copytex/">
    <img src="https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefoxbrowser&logoColor=white" alt="Install on Firefox">
  </a>
</p>

---

## ✨ What is AI Chat Toolkit?

AI Chat Toolkit is a browser extension that supercharges your AI chat workflow:

- **LaTeX Copy** — Double-click any rendered math formula on AI chat pages to copy the real LaTeX source to your clipboard. No more retyping integrals, matrices, or proofs.
- **Conversation Export / Backup** — Export the current chat or **all chats** as Markdown / JSON, with a beautiful in-page export modal and ZIP download.
- **Interactive Timeline** — A slim sidebar with proportional dots lets you jump to any user message in long conversations.
- **Prompt Manager** — Save, organize, and quickly insert custom prompts into the chat input box.

## 🌐 Supported Platforms

| Platform | LaTeX Copy | Export | Timeline | Prompt Button |
|----------|:----------:|:------:|:--------:|:-------------:|
| **ChatGPT** | ✅ | ✅ | ✅ | ✅ |
| **Gemini** | ✅ | ✅ | ✅ | ✅ |
| **Claude** | ✅ | ✅ | ✅ | ✅ |
| **DeepSeek** | ✅ | ✅ | ✅ | ✅ |
| **Grok** | ✅ | ✅ | ✅ | ✅ |
| **Poe** | ✅ | ✅ | ✅ | ✅ |
| **Doubao (豆包)** | ✅ | ✅ | — | ✅ |

LaTeX copy also works on any webpage using KaTeX or MathJax renderers.

## 🚀 Quick Start

### Chrome / Edge / Brave (Manifest V3)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer Mode**.
4. Click **Load unpacked** → select the `AI Chat Toolkit-Chrome` folder.
5. Navigate to any supported AI chat and start using AI Chat Toolkit.

### Firefox (Manifest V2)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** → select `AI Chat Toolkit-Chrome/manifest-v2.json`.

## 📖 Features

### 🔢 LaTeX Copy
- Hover over a rendered formula to see a highlight.
- **Double-click** to copy the LaTeX source to your clipboard.
- A toast notification confirms the copy.
- Works with KaTeX, MathJax, and Shadow DOM elements.

### 📤 Conversation Export
- Click the floating **Export** button at the bottom-right of any chat page.
- Choose **Current Chat** or **All Chats**.
- Select format: **Markdown**, **JSON**, or **Both**.
- All Chats exports as a `.zip` file with a real-time progress modal.

### 📍 Interactive Timeline
- A slim vertical bar on the right side of the page shows dots for each user message.
- Dots are positioned proportionally based on actual message locations.
- Click a dot to smooth-scroll to that message.
- Hover to see a preview tooltip of the message content.
- The active dot highlights automatically as you scroll.

### ✏️ Prompt Manager
- A prompt button appears next to the chat input box.
- Click to open a dropdown of your saved prompts.
- Click any prompt to insert it into the input box.
- Add new prompts via a beautiful in-page modal with name/content fields.
- Prompts are stored locally and persist across sessions.

## 🏗️ Project Structure

```
AI Chat Toolkit-Chrome/
├── manifest.json          # Chrome Manifest V3
├── manifest-v2.json       # Firefox Manifest V2
├── background.js          # Service worker (update handler, export orchestration)
├── content.js             # LaTeX detection & copy logic
├── exporter.js            # Message extraction & formatting (Markdown/JSON)
├── export-button.js       # In-page export button & modal UI
├── export-button.css      # Export button & modal styles
├── timeline.js            # Interactive timeline sidebar
├── timeline.css           # Timeline styles
├── promptbutton.js        # Prompt button & manager
├── promptbutton.css       # Prompt button styles
├── popup.html / popup.js  # Extension popup UI
├── jszip.min.js           # ZIP library for All Chats export
├── docs/update.html       # Changelog page (opened on update)
├── _locales/              # i18n (English, Chinese)
├── icons/                 # Extension icons
└── build.js / release.js  # Build & release scripts
```

## ⚙️ Permissions

| Permission | Purpose |
|------------|---------|
| `clipboardWrite` | Copy LaTeX to clipboard on double-click |
| `activeTab` | Inject content scripts on the active page |
| `scripting` | Programmatic script injection when needed |
| `storage` | Persist user settings and saved prompts |
| `<all_urls>` | Support LaTeX copy on any website |

No browsing data is collected, stored, or transmitted.

## 🌍 Localization

AI Chat Toolkit supports:
- 🇬🇧 English
- 🇨🇳 简体中文

Translations are in `_locales/`. PRs for additional languages are welcome.

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes: `git commit -m "Add my feature"`.
4. Push to the branch: `git push origin feature/my-feature`.
5. Open a Pull Request.

If you encounter a formula that doesn't copy correctly, please open an issue with the page URL and a screenshot of the equation.

## 📄 License

[MIT License](AI Chat Toolkit-Chrome/LICENSE) © 2024 [HeroBlast10](https://github.com/HeroBlast10)
