# CopyTeX – Instantly Copy Real LaTeX from AI chats

CopyTeX helps you capture the *real* LaTeX source behind math formulas on modern AI platforms without digging through developer tools. Install the extension, double‑click any rendered equation on Gemini, ChatGPT, Claude, DeepSeek, Grok, Poe, Kimi, and similar sites, and the original LaTeX is copied straight to your clipboard—ready for papers, slides, or further editing.

## Why Install CopyTeX?
- **Accurate Source Retrieval** – Extracts the authoring LaTeX directly from KaTeX/MathJax data nodes instead of guessing from the rendered HTML, so you receive clean, compiler‑ready output.
- **Time Saver** – Skip manual transcription and screenshotting; one double click replaces minutes of retyping complex integrals, matrices, or proofs.
- **Cross-Platform Coverage** – Works seamlessly across major AI chat services (Gemini, ChatGPT, Claude, DeepSeek, Grok, Kimi, Poe) and any webpage that uses common math renderers.
- **Instant Feedback** – A minimal toast confirms each successful copy, making bulk capture quick and reliable.

## Key Features
- Automatic detection of math containers, including Shadow DOM support.
- Clipboard integration with a fallback path that respects browser security policies.
- Lightweight content script with no background polling or analytics.
- Localized UI strings (English and Simplified Chinese) to fit mixed language workflows.

## Quick Start
1. Load the extension into Chrome/Edge (Developer Mode → *Load unpacked* → select this folder).
2. Open a supported AI platform (Gemini, Grok, ChatGPT, Claude, DeepSeek, Kimi, Poe, etc.) and generate a response containing math.
3. Hover to highlight a formula, then double‑click it. A toast confirms the LaTeX is now on your clipboard.
4. Paste the LaTeX wherever you need—Overleaf, Markdown notes, or computational notebooks.

## Permissions and Privacy
- **`activeTab`** is required to inject the content script only on the page you are viewing.
- **`clipboardWrite`** enables direct copying of LaTeX that you explicitly request. No browsing data is stored or transmitted.

## Need Help?
If you encounter a formula that does not copy correctly, capture the page URL and the visible equation, then open an issue or send feedback with those details. Continuous refinement depends on practical examples, and contributions are always welcome.
