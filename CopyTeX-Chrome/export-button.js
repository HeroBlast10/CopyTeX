// CopyTeX - In-Page Export Button & Modal
// Floating "Export Chat" button on supported AI chat pages with a full export modal

(function () {
    'use strict';

    const browserAPI = (() => {
        if (typeof browser !== 'undefined') return browser;
        if (typeof chrome !== 'undefined') return chrome;
        return null;
    })();

    // Supported platform hosts
    const SUPPORTED_HOSTS = [
        'chat.openai.com', 'chatgpt.com', 'gemini.google.com',
        'chat.deepseek.com', 'claude.ai', 'grok.com',
        'kimi.ai', 'kimi.moonshot.cn', 'poe.com'
    ];

    // Platform sidebar selectors for "All Conversations" scope
    const SIDEBAR_SELECTORS = {
        chatgpt: 'nav a[href*="/c/"], nav a[href*="/g/"]',
        gemini:  'a[href*="/app/"][role="listitem"], a[data-conversation-id]',
        deepseek: '.sidebar a[href*="/chat/"], nav a[href*="/chat/"]',
        claude:  'a[href*="/chat/"], nav a[href*="/chat/"]',
        grok:    'a[href*="/chat/"]',
        kimi:    'a[href*="/chat/"]',
        poe:     'a[href*="/chat/"]'
    };

    function isSupported() {
        const host = location.hostname;
        return SUPPORTED_HOSTS.some(h => host.includes(h));
    }

    function getExporter() {
        return window._copytexExporter || null;
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // Lucide SVG icon helper (inline, 1em sized)
    function lucide(paths, size) {
        const s = size || 20;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }

    const ICON = {
        messageCircle: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
        library: '<path d="M16 6l4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
        fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
        braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 1 2 2 2 2 0 0 1-2 2v5a2 2 0 0 1-2 2h-1"/>',
        package2: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
        checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
        alertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
    };

    // ============================================================
    //  Sidebar conversation link extractor
    // ============================================================
    function extractSidebarConversations() {
        const exporter = getExporter();
        if (!exporter) return [];

        const platform = exporter.detectPlatform();
        if (!platform) return [];

        const selectorKey = platform.id;
        const selector = SIDEBAR_SELECTORS[selectorKey];
        if (!selector) return [];

        const links = document.querySelectorAll(selector);
        const conversations = [];
        const seen = new Set();

        links.forEach(a => {
            const href = a.href || a.getAttribute('href');
            if (!href || seen.has(href)) return;
            seen.add(href);

            let title = a.textContent?.trim() || '';
            // Clean up titles
            title = title.replace(/\s+/g, ' ').substring(0, 100);
            if (!title || title.length < 2) return;

            conversations.push({ title, url: href });
        });

        return conversations;
    }

    // ============================================================
    //  Export Button Manager
    // ============================================================
    class ExportButtonManager {
        constructor() {
            this.fab = null;
            this.modalOverlay = null;
            this._currentScope = 'current';
            this._currentFormat = 'markdown';
        }

        init() {
            if (!isSupported()) return;
            this._createFAB();
        }

        _createFAB() {
            if (this.fab) return;

            this.fab = document.createElement('button');
            this.fab.className = 'copytex-export-fab';
            this.fab.setAttribute('title', 'Export Chat');
            this.fab.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>`;
            this.fab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showModal();
            });
            document.body.appendChild(this.fab);
        }

        // ============================================================
        //  Modal
        // ============================================================
        _showModal() {
            if (this.modalOverlay) return;

            const exporter = getExporter();
            const platform = exporter ? exporter.detectPlatform() : null;
            const messages = exporter ? exporter.extractMessages() : [];
            const title = exporter ? exporter.getConversationTitle() : 'AI Conversation';
            const msgCount = messages.length;
            const sidebarConvos = extractSidebarConversations();

            // Build overlay
            const overlay = document.createElement('div');
            overlay.className = 'copytex-export-overlay';
            this.modalOverlay = overlay;

            const modal = document.createElement('div');
            modal.className = 'copytex-export-modal';

            // --- Header ---
            const header = document.createElement('div');
            header.className = 'copytex-export-modal-header';
            header.innerHTML = `
                <h3>
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export Chat
                </h3>
                <div class="copytex-export-subtitle">Save your conversations for later</div>`;
            modal.appendChild(header);

            // --- Platform info ---
            const platBar = document.createElement('div');
            platBar.className = 'copytex-export-platform' + (platform ? ' ok' : ' warn');
            if (platform) {
                const metaParts = [];
                if (msgCount > 0) metaParts.push(msgCount + ' messages');
                if (title) metaParts.push(title.length > 40 ? title.substring(0, 40) + '…' : title);
                if (sidebarConvos.length > 0) metaParts.push(sidebarConvos.length + ' conversations in sidebar');
                platBar.innerHTML = `
                    <span class="ep-icon">${lucide(ICON.checkCircle, 18)}</span>
                    <div class="ep-info">
                        <div class="ep-name">${escapeHtml(platform.name)}</div>
                        <div class="ep-meta">${escapeHtml(metaParts.join(' · '))}</div>
                    </div>`;
            } else {
                platBar.innerHTML = `
                    <span class="ep-icon">${lucide(ICON.alertTriangle, 18)}</span>
                    <div class="ep-info">
                        <div class="ep-name">Platform not detected</div>
                        <div class="ep-meta">Try refreshing the page</div>
                    </div>`;
            }
            modal.appendChild(platBar);

            // --- Body ---
            const body = document.createElement('div');
            body.className = 'copytex-export-modal-body';

            // Scope selection
            const scopeSection = document.createElement('div');
            scopeSection.className = 'copytex-export-section';
            scopeSection.innerHTML = `<div class="copytex-export-section-label">Export Scope</div>`;
            const scopeOptions = document.createElement('div');
            scopeOptions.className = 'copytex-export-options';
            scopeOptions.innerHTML = `
                <label class="copytex-export-option">
                    <input type="radio" name="copytex-scope" value="current" checked>
                    <div class="copytex-export-option-card">
                        <span class="eo-icon">${lucide(ICON.messageCircle, 24)}</span>
                        <span class="eo-title">Current Chat</span>
                        <span class="eo-desc">${msgCount} messages</span>
                    </div>
                </label>
                <label class="copytex-export-option">
                    <input type="radio" name="copytex-scope" value="all">
                    <div class="copytex-export-option-card">
                        <span class="eo-icon">${lucide(ICON.library, 24)}</span>
                        <span class="eo-title">All Chats</span>
                        <span class="eo-desc">${sidebarConvos.length > 0 ? sidebarConvos.length + ' found' : 'Sidebar links'}</span>
                    </div>
                </label>`;
            scopeSection.appendChild(scopeOptions);
            body.appendChild(scopeSection);

            // Format selection
            const fmtSection = document.createElement('div');
            fmtSection.className = 'copytex-export-section';
            fmtSection.innerHTML = `<div class="copytex-export-section-label">Format</div>`;
            const fmtOptions = document.createElement('div');
            fmtOptions.className = 'copytex-export-options';
            fmtOptions.innerHTML = `
                <label class="copytex-export-option">
                    <input type="radio" name="copytex-format" value="markdown" checked>
                    <div class="copytex-export-option-card">
                        <span class="eo-icon">${lucide(ICON.fileText, 24)}</span>
                        <span class="eo-title">Markdown</span>
                        <span class="eo-desc">.md file</span>
                    </div>
                </label>
                <label class="copytex-export-option">
                    <input type="radio" name="copytex-format" value="json">
                    <div class="copytex-export-option-card">
                        <span class="eo-icon">${lucide(ICON.braces, 24)}</span>
                        <span class="eo-title">JSON</span>
                        <span class="eo-desc">.json file</span>
                    </div>
                </label>
                <label class="copytex-export-option">
                    <input type="radio" name="copytex-format" value="both">
                    <div class="copytex-export-option-card">
                        <span class="eo-icon">${lucide(ICON.package2, 24)}</span>
                        <span class="eo-title">Both</span>
                        <span class="eo-desc">.md + .json</span>
                    </div>
                </label>`;
            fmtSection.appendChild(fmtOptions);
            body.appendChild(fmtSection);

            modal.appendChild(body);

            // --- Status ---
            const status = document.createElement('div');
            status.className = 'copytex-export-status';
            status.id = 'copytex-export-status';
            modal.appendChild(status);

            // --- Footer ---
            const footer = document.createElement('div');
            footer.className = 'copytex-export-modal-footer';
            footer.innerHTML = `
                <button class="copytex-export-btn copytex-export-btn-cancel">Cancel</button>
                <button class="copytex-export-btn copytex-export-btn-export" ${msgCount === 0 && sidebarConvos.length === 0 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <span>Export</span>
                </button>`;
            modal.appendChild(footer);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // --- Bind events ---
            const cancelBtn = footer.querySelector('.copytex-export-btn-cancel');
            const exportBtn = footer.querySelector('.copytex-export-btn-export');
            const exportBtnText = exportBtn.querySelector('span');

            const close = () => this._closeModal();

            cancelBtn.addEventListener('click', close);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

            // Track scope/format selection
            scopeOptions.addEventListener('change', (e) => {
                this._currentScope = e.target.value;
                // Enable/disable export based on selection
                if (this._currentScope === 'current') {
                    exportBtn.disabled = (msgCount === 0);
                } else {
                    exportBtn.disabled = (sidebarConvos.length === 0 && msgCount === 0);
                }
            });
            fmtOptions.addEventListener('change', (e) => {
                this._currentFormat = e.target.value;
            });

            // Export action
            exportBtn.addEventListener('click', () => {
                this._doExport(exportBtn, exportBtnText, status, sidebarConvos);
            });

            // Keyboard
            const onKey = (e) => {
                if (e.key === 'Escape') close();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    if (!exportBtn.disabled) this._doExport(exportBtn, exportBtnText, status, sidebarConvos);
                }
            };
            document.addEventListener('keydown', onKey);
            this._modalKeyHandler = onKey;

            // Animate in
            requestAnimationFrame(() => overlay.classList.add('visible'));
        }

        _closeModal() {
            if (!this.modalOverlay) return;
            const overlay = this.modalOverlay;
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 200);
            this.modalOverlay = null;
            if (this._modalKeyHandler) {
                document.removeEventListener('keydown', this._modalKeyHandler);
                this._modalKeyHandler = null;
            }
        }

        // ============================================================
        //  Export Logic
        // ============================================================
        _doExport(btn, btnText, statusEl, sidebarConvos) {
            const exporter = getExporter();
            if (!exporter) {
                statusEl.textContent = 'Exporter not available. Refresh page.';
                statusEl.className = 'copytex-export-status err';
                return;
            }

            btn.disabled = true;
            btnText.textContent = 'Exporting…';
            statusEl.textContent = '';
            statusEl.className = 'copytex-export-status';

            try {
                if (this._currentScope === 'current') {
                    // Export current conversation
                    const result = exporter.exportConversation(this._currentFormat);
                    if (result.success) {
                        btn.classList.add('success');
                        btnText.textContent = 'Done!';
                        statusEl.textContent = result.messageCount + ' messages exported as ' + result.files.join(', ');
                        statusEl.className = 'copytex-export-status ok';
                        setTimeout(() => this._closeModal(), 2000);
                    } else {
                        btn.classList.add('error');
                        btnText.textContent = 'Failed';
                        statusEl.textContent = result.error || 'Export failed';
                        statusEl.className = 'copytex-export-status err';
                        this._resetExportBtn(btn, btnText);
                    }
                } else {
                    // Export all conversations (sidebar links + current content)
                    this._exportAll(exporter, sidebarConvos, btn, btnText, statusEl);
                }
            } catch (e) {
                console.error('[CopyTeX Export] Error:', e);
                btn.classList.add('error');
                btnText.textContent = 'Error';
                statusEl.textContent = e.message || 'Unexpected error';
                statusEl.className = 'copytex-export-status err';
                this._resetExportBtn(btn, btnText);
            }
        }

        _exportAll(exporter, sidebarConvos, btn, btnText, statusEl) {
            const format = this._currentFormat;
            const platform = exporter.detectPlatform();
            const platformName = platform ? platform.name : 'AI Chat';
            const timestamp = new Date().toISOString().slice(0, 10);

            if (typeof JSZip === 'undefined') {
                statusEl.textContent = 'JSZip library not loaded. Please refresh the page.';
                statusEl.className = 'copytex-export-status err';
                this._resetExportBtn(btn, btnText);
                return;
            }

            if (sidebarConvos.length === 0) {
                statusEl.textContent = 'No conversations found in sidebar.';
                statusEl.className = 'copytex-export-status err';
                this._resetExportBtn(btn, btnText);
                return;
            }

            // Close the export modal and show progress modal
            this._closeModal();
            this._showProgressModal(sidebarConvos, format, platformName, timestamp, exporter);
        }

        // ============================================================
        //  Progress Modal for All Chats Export
        // ============================================================
        _showProgressModal(conversations, format, platformName, timestamp, exporter) {
            if (this._progressOverlay) return;

            const overlay = document.createElement('div');
            overlay.className = 'copytex-export-overlay';
            this._progressOverlay = overlay;
            this._exportCancelled = false;

            const modal = document.createElement('div');
            modal.className = 'copytex-progress-modal';

            // Header
            const header = document.createElement('div');
            header.className = 'copytex-progress-header';
            header.innerHTML = `
                <h3>
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 6l4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>
                    </svg>
                    Exporting All Chats
                </h3>
                <div class="copytex-progress-subtitle">${conversations.length} conversations to export</div>`;
            modal.appendChild(header);

            // Progress bar
            const barWrap = document.createElement('div');
            barWrap.className = 'copytex-progress-bar-wrap';
            barWrap.innerHTML = `
                <div class="copytex-progress-info">
                    <span>Progress</span>
                    <span class="copytex-progress-count" id="copytex-prog-count">0 / ${conversations.length}</span>
                </div>
                <div class="copytex-progress-track">
                    <div class="copytex-progress-fill" id="copytex-prog-fill"></div>
                </div>`;
            modal.appendChild(barWrap);

            // Current item
            const currentDiv = document.createElement('div');
            currentDiv.className = 'copytex-progress-current';
            currentDiv.id = 'copytex-prog-current';
            currentDiv.innerHTML = `
                <svg class="spinning" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <span class="copytex-progress-current-title">Preparing…</span>`;
            modal.appendChild(currentDiv);

            // Log list
            const log = document.createElement('div');
            log.className = 'copytex-progress-log';
            log.id = 'copytex-prog-log';
            modal.appendChild(log);

            // Final status (hidden initially)
            const finalDiv = document.createElement('div');
            finalDiv.className = 'copytex-progress-final';
            finalDiv.id = 'copytex-prog-final';
            finalDiv.style.display = 'none';
            modal.appendChild(finalDiv);

            // Footer
            const footer = document.createElement('div');
            footer.className = 'copytex-progress-footer';
            footer.innerHTML = `<button class="copytex-progress-cancel-btn" id="copytex-prog-cancel">Cancel</button>`;
            modal.appendChild(footer);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('visible'));

            // Cancel button
            const cancelBtn = footer.querySelector('#copytex-prog-cancel');
            cancelBtn.addEventListener('click', () => {
                this._exportCancelled = true;
                this._closeProgressModal();
            });

            // Start the export via background script
            this._startBackgroundExport(conversations, format, platformName, timestamp, exporter);
        }

        _startBackgroundExport(conversations, format, platformName, timestamp, exporter) {
            const self = this;

            // Listen for progress and completion messages from background
            const onMessage = (request, sender, sendResponse) => {
                if (self._exportCancelled) return;

                if (request.type === 'exportAllChatsProgress') {
                    self._updateProgress(request);
                }

                if (request.type === 'exportAllChatsComplete') {
                    // Remove listener
                    if (browserAPI?.runtime?.onMessage) {
                        browserAPI.runtime.onMessage.removeListener(onMessage);
                    }
                    self._handleExportComplete(request.results, format, platformName, timestamp, exporter);
                }
            };

            if (browserAPI?.runtime?.onMessage) {
                browserAPI.runtime.onMessage.addListener(onMessage);
            }
            this._progressMessageListener = onMessage;

            // Send request to background to start extraction
            if (browserAPI?.runtime?.sendMessage) {
                browserAPI.runtime.sendMessage({
                    type: 'exportAllChats',
                    conversations: conversations,
                    format: format
                }, (response) => {
                    if (browserAPI.runtime.lastError || !response || !response.started) {
                        console.error('[CopyTeX Export] Failed to start background export');
                        this._closeProgressModal();
                    }
                });
            }
        }

        _updateProgress(data) {
            const fill = document.getElementById('copytex-prog-fill');
            const count = document.getElementById('copytex-prog-count');
            const current = document.getElementById('copytex-prog-current');
            const log = document.getElementById('copytex-prog-log');

            if (!fill || !count || !current || !log) return;

            const pct = Math.round((data.current / data.total) * 100);

            if (data.status === 'extracting') {
                // Currently extracting this conversation
                fill.style.width = Math.round(((data.current - 0.5) / data.total) * 100) + '%';
                count.textContent = (data.current - 1) + ' / ' + data.total;
                const shortTitle = data.title.length > 50 ? data.title.substring(0, 50) + '…' : data.title;
                current.innerHTML = `
                    <svg class="spinning" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <span class="copytex-progress-current-title">${escapeHtml(shortTitle)}</span>`;
            } else {
                // Done or skipped
                fill.style.width = pct + '%';
                count.textContent = data.current + ' / ' + data.total;

                const isDone = data.status === 'done';
                const shortTitle = data.title.length > 45 ? data.title.substring(0, 45) + '…' : data.title;
                const iconSvg = isDone
                    ? '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>'
                    : '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
                const countText = isDone ? (data.messageCount + ' msgs') : 'skipped';

                const item = document.createElement('div');
                item.className = 'copytex-progress-log-item ' + data.status;
                item.innerHTML = `${iconSvg}<span class="pli-title">${escapeHtml(shortTitle)}</span><span class="pli-count">${countText}</span>`;
                log.appendChild(item);
                log.scrollTop = log.scrollHeight;
            }
        }

        async _handleExportComplete(results, format, platformName, timestamp, exporter) {
            const current = document.getElementById('copytex-prog-current');
            const finalDiv = document.getElementById('copytex-prog-final');
            const cancelBtn = document.getElementById('copytex-prog-cancel');

            if (current) current.style.display = 'none';

            if (this._exportCancelled) return;

            const zip = new JSZip();
            let fileCount = 0;
            let totalMessages = 0;

            for (const r of results) {
                if (r.messageCount > 0) {
                    const safeName = exporter.sanitizeFilename(r.title || r.originalTitle || 'conversation');
                    if (r.markdown) {
                        zip.file(safeName + '_' + timestamp + '.md', r.markdown);
                        fileCount++;
                    }
                    if (r.json) {
                        zip.file(safeName + '_' + timestamp + '.json', r.json);
                        fileCount++;
                    }
                    totalMessages += r.messageCount;
                }
            }

            if (fileCount === 0) {
                if (finalDiv) {
                    finalDiv.style.display = 'block';
                    finalDiv.textContent = 'No messages found in any conversation.';
                    finalDiv.style.color = '#dc2626';
                }
                if (cancelBtn) cancelBtn.textContent = 'Close';
                return;
            }

            // Generate and download zip
            try {
                if (finalDiv) {
                    finalDiv.style.display = 'block';
                    finalDiv.textContent = 'Generating ZIP…';
                }

                const blob = await zip.generateAsync({ type: 'blob' });
                const zipName = exporter.sanitizeFilename(platformName + '_AllChats_' + timestamp) + '.zip';
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = zipName;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);

                const successCount = results.filter(r => r.messageCount > 0).length;
                if (finalDiv) {
                    finalDiv.textContent = successCount + ' chats · ' + totalMessages + ' messages · ' + fileCount + ' files → ' + zipName;
                }
                if (cancelBtn) cancelBtn.textContent = 'Close';

                setTimeout(() => this._closeProgressModal(), 4000);
            } catch (zipErr) {
                console.error('[CopyTeX Export] Zip error:', zipErr);
                if (finalDiv) {
                    finalDiv.style.display = 'block';
                    finalDiv.textContent = 'ZIP generation failed: ' + (zipErr.message || 'Unknown error');
                    finalDiv.style.color = '#dc2626';
                }
                if (cancelBtn) cancelBtn.textContent = 'Close';
            }
        }

        _closeProgressModal() {
            if (!this._progressOverlay) return;
            const overlay = this._progressOverlay;
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 200);
            this._progressOverlay = null;
            if (this._progressMessageListener && browserAPI?.runtime?.onMessage) {
                browserAPI.runtime.onMessage.removeListener(this._progressMessageListener);
                this._progressMessageListener = null;
            }
        }

        _resetExportBtn(btn, btnText) {
            setTimeout(() => {
                btn.disabled = false;
                btn.classList.remove('success', 'error');
                btnText.textContent = 'Export';
            }, 2500);
        }

        destroy() {
            if (this.fab) { this.fab.remove(); this.fab = null; }
            this._closeModal();
        }
    }

    // ============================================================
    //  Initialize
    // ============================================================
    let manager = null;

    function initExportButton() {
        if (!isSupported()) return;
        manager = new ExportButtonManager();
        manager.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initExportButton, 1000), { once: true });
    } else {
        setTimeout(initExportButton, 1000);
    }

    window.addEventListener('beforeunload', () => { if (manager) manager.destroy(); });

})();
