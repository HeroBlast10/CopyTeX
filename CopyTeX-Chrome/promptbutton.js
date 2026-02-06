// CopyTeX - Prompt Button
// Quick prompt insertion near the input box on AI chat platforms

(function () {
    'use strict';

    const browserAPI = (() => {
        if (typeof browser !== 'undefined') return browser;
        if (typeof chrome !== 'undefined') return chrome;
        return null;
    })();

    // ============================================================
    //  Input box selectors per platform
    // ============================================================
    const INPUT_ADAPTERS = {
        chatgpt: {
            hosts: ['chatgpt.com', 'chat.openai.com'],
            inputSelector: '#prompt-textarea, [id="prompt-textarea"], textarea[data-id="root"]',
            getOffset: () => ({ top: 8, left: 0 }),
            insertText: (input, text) => insertContentEditable(input, text)
        },
        gemini: {
            hosts: ['gemini.google.com'],
            inputSelector: '.ql-editor, [contenteditable="true"][aria-label], rich-textarea [contenteditable]',
            getOffset: () => ({ top: 8, left: 0 }),
            insertText: (input, text) => insertContentEditable(input, text)
        },
        deepseek: {
            hosts: ['chat.deepseek.com'],
            inputSelector: 'textarea, [contenteditable="true"]',
            getOffset: () => ({ top: 8, left: 0 }),
            insertText: (input, text) => {
                if (input.isContentEditable) insertContentEditable(input, text);
                else insertTextarea(input, text);
            }
        },
        claude: {
            hosts: ['claude.ai'],
            inputSelector: '[contenteditable="true"].ProseMirror, [contenteditable="true"]',
            getOffset: () => ({ top: 8, left: 0 }),
            insertText: (input, text) => insertContentEditable(input, text)
        },
        grok: {
            hosts: ['grok.com'],
            inputSelector: 'textarea, [contenteditable="true"]',
            getOffset: () => ({ top: 8, left: 0 }),
            insertText: (input, text) => {
                if (input.isContentEditable) insertContentEditable(input, text);
                else insertTextarea(input, text);
            }
        },
        kimi: {
            hosts: ['kimi.ai', 'kimi.moonshot.cn'],
            inputSelector: 'textarea, [contenteditable="true"]',
            getOffset: () => ({ top: 8, left: 0 }),
            insertText: (input, text) => {
                if (input.isContentEditable) insertContentEditable(input, text);
                else insertTextarea(input, text);
            }
        },
        poe: {
            hosts: ['poe.com'],
            inputSelector: 'textarea, [contenteditable="true"]',
            getOffset: () => ({ top: 8, left: 0 }),
            insertText: (input, text) => {
                if (input.isContentEditable) insertContentEditable(input, text);
                else insertTextarea(input, text);
            }
        }
    };

    function insertContentEditable(el, text) {
        el.focus();
        const current = el.textContent || '';
        const sep = current.trim() ? '\n' : '';
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, sep + text);
    }

    function insertTextarea(el, text) {
        el.focus();
        const val = el.value || '';
        const sep = val.trim() ? '\n' : '';
        el.value = val + sep + text;
        el.selectionStart = el.selectionEnd = el.value.length;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function detectInputAdapter() {
        const hostname = location.hostname;
        for (const [id, adapter] of Object.entries(INPUT_ADAPTERS)) {
            if (adapter.hosts.some(h => hostname.includes(h))) {
                return { id, ...adapter };
            }
        }
        return null;
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // ============================================================
    //  Prompt Button Manager
    // ============================================================
    class PromptButtonManager {
        constructor(adapter) {
            this.adapter = adapter;
            this.button = null;
            this.dropdown = null;
            this.overlay = null;
            this.inputElement = null;
            this.prompts = [];
            this._observer = null;
            this._resizeHandler = null;
            this._rafPending = false;
        }

        async init() {
            await this._loadPrompts();
            this._createButton();
            this._startInputDetection();
            this._findInputAndShow();
            this._listenStorage();
        }

        async _loadPrompts() {
            try {
                const result = await browserAPI.storage.local.get('copytex_prompts');
                this.prompts = result.copytex_prompts || [];
            } catch (e) {
                this.prompts = [];
            }
        }

        _listenStorage() {
            browserAPI.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.copytex_prompts) {
                    this.prompts = changes.copytex_prompts.newValue || [];
                }
            });
        }

        _createButton() {
            if (this.button) return;
            this.button = document.createElement('div');
            this.button.className = 'copytex-prompt-btn';
            this.button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>`;
            this.button.style.display = 'none';
            this.button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._handleClick();
            });
            document.body.appendChild(this.button);
        }

        _startInputDetection() {
            let debounceTimer = null;
            this._observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    if (!this.inputElement || !document.body.contains(this.inputElement)) {
                        this.inputElement = null;
                        this._hideButton();
                        this._findInputAndShow();
                    } else {
                        this._updatePosition();
                    }
                }, 300);
            });
            this._observer.observe(document.body, { childList: true, subtree: true });

            this._resizeHandler = () => {
                if (this._rafPending) return;
                this._rafPending = true;
                requestAnimationFrame(() => {
                    this._rafPending = false;
                    this._updatePosition();
                });
            };
            window.addEventListener('resize', this._resizeHandler, { passive: true });
        }

        _findInputAndShow() {
            const el = document.querySelector(this.adapter.inputSelector);
            if (el) {
                this.inputElement = el;
                this._updatePosition();
            }
        }

        _updatePosition() {
            if (!this.button || !this.inputElement || !document.body.contains(this.inputElement)) {
                this._hideButton();
                return;
            }
            const rect = this.inputElement.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) { this._hideButton(); return; }

            const offset = this.adapter.getOffset();
            this.button.style.display = 'flex';
            this.button.style.visibility = 'hidden';
            const btnRect = this.button.getBoundingClientRect();

            const top = rect.top + offset.top;
            const left = rect.left - btnRect.width - 8 + offset.left;

            this.button.style.top = `${Math.max(8, Math.min(top, window.innerHeight - btnRect.height - 8))}px`;
            this.button.style.left = `${Math.max(8, left)}px`;
            this.button.style.visibility = 'visible';
        }

        _hideButton() {
            if (this.button) this.button.style.display = 'none';
        }

        _handleClick() {
            if (this.dropdown) { this._hideDropdown(); return; }
            this._showDropdown();
        }

        _showDropdown() {
            // Overlay
            this.overlay = document.createElement('div');
            this.overlay.className = 'copytex-prompt-overlay';
            this.overlay.addEventListener('click', () => this._hideDropdown());
            document.body.appendChild(this.overlay);

            // Dropdown
            this.dropdown = document.createElement('div');
            this.dropdown.className = 'copytex-prompt-dropdown';

            // Header
            const header = document.createElement('div');
            header.className = 'copytex-prompt-header';
            header.innerHTML = `
                <div class="copytex-prompt-header-title">
                    <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    <span>Prompts</span>
                </div>
                <button class="copytex-prompt-header-add" title="Add prompt">
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <path d="M7 1V13M1 7H13"/>
                    </svg>
                </button>`;
            header.querySelector('.copytex-prompt-header-add').addEventListener('click', (e) => {
                e.stopPropagation();
                this._hideDropdown();
                this._showAddPromptDialog();
            });
            this.dropdown.appendChild(header);

            // Body
            const body = document.createElement('div');
            body.className = 'copytex-prompt-body';

            if (this.prompts.length > 0) {
                this.prompts.forEach((p, idx) => {
                    const item = document.createElement('div');
                    item.className = 'copytex-prompt-item';
                    const preview = p.content ? (p.content.length > 50 ? p.content.substring(0, 50) + '…' : p.content) : '';
                    item.innerHTML = `
                        <div class="copytex-prompt-item-name">${escapeHtml(p.name || 'Untitled')}</div>
                        <div class="copytex-prompt-item-preview">${escapeHtml(preview)}</div>
                        <button class="copytex-prompt-item-delete" title="Delete">✕</button>`;
                    item.querySelector('.copytex-prompt-item-delete').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._deletePrompt(idx);
                        item.remove();
                    });
                    item.addEventListener('click', () => {
                        this._hideDropdown();
                        this._insertPrompt(p);
                    });
                    body.appendChild(item);
                });
            } else {
                body.innerHTML = `
                    <div class="copytex-prompt-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <div>No prompts yet. Click + to add one.</div>
                    </div>`;
            }
            this.dropdown.appendChild(body);
            document.body.appendChild(this.dropdown);

            // Position above button
            if (this.button) {
                const btnRect = this.button.getBoundingClientRect();
                let left = btnRect.left;
                if (left + 300 > window.innerWidth - 8) left = window.innerWidth - 308;
                left = Math.max(8, left);
                let top = Math.max(20, btnRect.top - 8 - 360);
                this.dropdown.style.left = `${left}px`;
                this.dropdown.style.top = `${top}px`;
            }

            requestAnimationFrame(() => this.dropdown.classList.add('visible'));
        }

        _hideDropdown() {
            if (this.overlay) { this.overlay.remove(); this.overlay = null; }
            if (this.dropdown) {
                this.dropdown.classList.remove('visible');
                setTimeout(() => { if (this.dropdown) { this.dropdown.remove(); this.dropdown = null; } }, 150);
            }
        }

        _insertPrompt(prompt) {
            if (!this.inputElement || !prompt.content) return;
            try {
                this.adapter.insertText(this.inputElement, prompt.content);
            } catch (e) {
                console.error('[CopyTeX PromptButton] Insert failed:', e);
            }
        }

        async _deletePrompt(index) {
            this.prompts.splice(index, 1);
            try {
                await browserAPI.storage.local.set({ copytex_prompts: this.prompts });
            } catch (e) { /* ignore */ }
        }

        _showAddPromptDialog() {
            // Simple prompt dialog using browser prompt()
            const name = window.prompt('Prompt name:');
            if (!name) return;
            const content = window.prompt('Prompt content:');
            if (!content) return;
            const newPrompt = { id: Date.now().toString(), name: name.trim(), content: content.trim() };
            this.prompts.push(newPrompt);
            browserAPI.storage.local.set({ copytex_prompts: this.prompts }).catch(() => {});
        }

        destroy() {
            if (this._observer) this._observer.disconnect();
            if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
            if (this.button) this.button.remove();
            this._hideDropdown();
        }
    }

    // ============================================================
    //  Initialize
    // ============================================================
    let manager = null;

    function initPromptButton() {
        const adapter = detectInputAdapter();
        if (!adapter) return;
        manager = new PromptButtonManager(adapter);
        manager.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initPromptButton, 800), { once: true });
    } else {
        setTimeout(initPromptButton, 800);
    }

    window.addEventListener('beforeunload', () => { if (manager) manager.destroy(); });

    // Listen for messages from popup to manage prompts
    if (browserAPI?.runtime?.onMessage) {
        browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'getPrompts') {
                browserAPI.storage.local.get('copytex_prompts').then(r => {
                    sendResponse({ prompts: r.copytex_prompts || [] });
                }).catch(() => sendResponse({ prompts: [] }));
                return true;
            }
            if (request.type === 'setPrompts') {
                browserAPI.storage.local.set({ copytex_prompts: request.prompts }).then(() => {
                    sendResponse({ success: true });
                }).catch(() => sendResponse({ success: false }));
                return true;
            }
        });
    }

})();
