// CopyTeX - Timeline
// Interactive conversation navigation sidebar for AI chat platforms

(function () {
    'use strict';

    // ============================================================
    //  Platform adapters — selectors for user messages per site
    // ============================================================
    const TIMELINE_ADAPTERS = {
        chatgpt: {
            hosts: ['chatgpt.com', 'chat.openai.com'],
            userSelector: '[data-message-author-role="user"]',
            containerUp: 'main',
            position: { top: '70px', right: '16px', bottom: '140px' },
            getText: el => {
                const article = el.closest('article') || el.closest('[data-testid^="conversation-turn"]') || el;
                const c = article.querySelector('.whitespace-pre-wrap') || el;
                return (c.textContent || '').trim();
            },
            isConversation: () => /\/c\//.test(location.pathname) || document.querySelector('[data-message-author-role]'),
            getScrollContainer: () => {
                const main = document.querySelector('main');
                if (!main) return null;
                let el = main;
                while (el && el !== document.body) {
                    const s = getComputedStyle(el).overflowY;
                    if (s === 'auto' || s === 'scroll') return el;
                    el = el.parentElement;
                }
                return document.scrollingElement || document.documentElement;
            }
        },
        gemini: {
            hosts: ['gemini.google.com'],
            userSelector: 'user-query, .user-query, .query-content',
            containerUp: 'main',
            position: { top: '70px', right: '16px', bottom: '160px' },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => /\/app\//.test(location.pathname) || document.querySelector('user-query, .user-query'),
            getScrollContainer: () => {
                const c = document.querySelector('.conversation-container, main');
                if (!c) return document.scrollingElement || document.documentElement;
                let el = c;
                while (el && el !== document.body) {
                    const s = getComputedStyle(el).overflowY;
                    if (s === 'auto' || s === 'scroll') return el;
                    el = el.parentElement;
                }
                return document.scrollingElement || document.documentElement;
            }
        },
        deepseek: {
            hosts: ['chat.deepseek.com'],
            userSelector: '[class*="chat-message"][class*="user"], [data-role="user"], [class*="msg-item"][class*="user"]',
            containerUp: 'main',
            position: { top: '70px', right: '16px', bottom: '140px' },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="chat-message"], [class*="msg-item"]'),
            getScrollContainer: () => {
                const c = document.querySelector('[class*="chat-container"], main');
                if (!c) return document.scrollingElement || document.documentElement;
                let el = c;
                while (el && el !== document.body) {
                    const s = getComputedStyle(el).overflowY;
                    if (s === 'auto' || s === 'scroll') return el;
                    el = el.parentElement;
                }
                return document.scrollingElement || document.documentElement;
            }
        },
        claude: {
            hosts: ['claude.ai'],
            userSelector: '[data-testid="user-message"], [class*="human-message"], [class*="user-message"]',
            containerUp: 'main',
            position: { top: '60px', right: '16px', bottom: '140px' },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => /\/chat\//.test(location.pathname) || document.querySelector('[data-testid="user-message"]'),
            getScrollContainer: () => {
                const main = document.querySelector('main, [class*="conversation"]');
                if (!main) return document.scrollingElement || document.documentElement;
                let el = main;
                while (el && el !== document.body) {
                    const s = getComputedStyle(el).overflowY;
                    if (s === 'auto' || s === 'scroll') return el;
                    el = el.parentElement;
                }
                return document.scrollingElement || document.documentElement;
            }
        },
        grok: {
            hosts: ['grok.com'],
            userSelector: '[class*="message"][class*="user"], [class*="human"]',
            containerUp: 'main',
            position: { top: '70px', right: '16px', bottom: '140px' },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="message"]'),
            getScrollContainer: () => document.scrollingElement || document.documentElement
        },
        kimi: {
            hosts: ['kimi.ai', 'kimi.moonshot.cn'],
            userSelector: '[class*="chat-message"][class*="user"], [data-role="user"]',
            containerUp: 'main',
            position: { top: '70px', right: '16px', bottom: '140px' },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="chat-message"]'),
            getScrollContainer: () => document.scrollingElement || document.documentElement
        },
        poe: {
            hosts: ['poe.com'],
            userSelector: '[class*="Message"][class*="human"], [class*="Message"][class*="Human"]',
            containerUp: 'main',
            position: { top: '70px', right: '16px', bottom: '140px' },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="Message"]'),
            getScrollContainer: () => document.scrollingElement || document.documentElement
        }
    };

    function detectAdapter() {
        const hostname = location.hostname;
        const url = location.href;
        for (const [id, adapter] of Object.entries(TIMELINE_ADAPTERS)) {
            if (adapter.hosts.some(h => hostname.includes(h) || url.includes(h))) {
                return { id, ...adapter };
            }
        }
        return null;
    }

    // ============================================================
    //  Timeline Manager
    // ============================================================
    class CopyTexTimeline {
        constructor(adapter) {
            this.adapter = adapter;
            this.wrapper = null;
            this.bar = null;
            this.track = null;
            this.toggleBtn = null;
            this.tip = null;
            this.dots = [];
            this.userMessages = [];
            this.activeIndex = -1;
            this.scrollContainer = null;
            this.observer = null;
            this.scrollHandler = null;
            this.isCollapsed = false;
            this.tipTimer = null;
            this._lastUrl = location.href;
            this._urlCheckInterval = null;
            this._resizeHandler = null;
        }

        async init() {
            // Wait for user messages to appear
            const found = await this._waitForMessages(8000);
            if (!found) return;

            this.scrollContainer = this.adapter.getScrollContainer();
            if (!this.scrollContainer) return;

            this._injectUI();
            this._renderDots();
            this._bindEvents();
            this._observeDom();
            this._syncActive();

            // URL change detection (SPA navigation)
            this._urlCheckInterval = setInterval(() => {
                if (location.href !== this._lastUrl) {
                    this._lastUrl = location.href;
                    this._onUrlChange();
                }
            }, 800);
        }

        _waitForMessages(timeout) {
            return new Promise(resolve => {
                const check = () => {
                    const msgs = document.querySelectorAll(this.adapter.userSelector);
                    if (msgs.length > 0) { resolve(true); return; }
                    return false;
                };
                if (check()) return;
                const start = Date.now();
                const interval = setInterval(() => {
                    if (check()) { clearInterval(interval); return; }
                    if (Date.now() - start > timeout) { clearInterval(interval); resolve(false); }
                }, 400);
            });
        }

        _injectUI() {
            // Wrapper
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'copytex-timeline-wrapper';
            const pos = this.adapter.position;
            if (pos.top) this.wrapper.style.top = pos.top;
            if (pos.right) { this.wrapper.style.right = pos.right; this.wrapper.style.left = 'auto'; }

            // Bar
            this.bar = document.createElement('div');
            this.bar.className = 'copytex-timeline-bar';
            if (pos.bottom) {
                this.bar.style.height = `calc(100vh - ${pos.top} - ${pos.bottom})`;
            }

            // Track
            this.track = document.createElement('div');
            this.track.className = 'copytex-timeline-track';
            this.bar.appendChild(this.track);
            this.wrapper.appendChild(this.bar);
            document.body.appendChild(this.wrapper);

            // Tooltip
            this.tip = document.createElement('div');
            this.tip.className = 'copytex-timeline-tip';
            document.body.appendChild(this.tip);

            // Toggle button
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.className = 'copytex-timeline-toggle';
            this.toggleBtn.innerHTML = '«';
            this.toggleBtn.title = 'Toggle timeline';
            this.toggleBtn.addEventListener('click', () => this._toggle());
            document.body.appendChild(this.toggleBtn);

            // Show toggle on wrapper hover
            this.wrapper.addEventListener('mouseenter', () => {
                if (!this.isCollapsed) this.toggleBtn.classList.add('visible');
            });
            this.wrapper.addEventListener('mouseleave', () => {
                setTimeout(() => {
                    if (!this.toggleBtn.matches(':hover')) this.toggleBtn.classList.remove('visible');
                }, 60);
            });
            this.toggleBtn.addEventListener('mouseleave', () => {
                this.toggleBtn.classList.remove('visible');
            });
        }

        _renderDots() {
            this.track.innerHTML = '';
            this.dots = [];
            this.userMessages = Array.from(document.querySelectorAll(this.adapter.userSelector));

            this.userMessages.forEach((msg, i) => {
                const dot = document.createElement('button');
                dot.className = 'copytex-timeline-dot';
                dot.setAttribute('aria-label', `Message ${i + 1}`);
                dot.dataset.index = i;

                dot.addEventListener('click', () => this._scrollToMessage(i));
                dot.addEventListener('mouseenter', () => this._showTip(dot, i));
                dot.addEventListener('mouseleave', () => this._hideTip());

                this.track.appendChild(dot);
                this.dots.push(dot);
            });

            this._syncActive();
        }

        _scrollToMessage(index) {
            const msg = this.userMessages[index];
            if (!msg || !msg.isConnected) return;

            msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Brief highlight flash
            const origBg = msg.style.backgroundColor;
            msg.style.transition = 'background-color 0.3s ease';
            msg.style.backgroundColor = 'rgba(102, 126, 234, 0.08)';
            setTimeout(() => { msg.style.backgroundColor = origBg; }, 1200);
        }

        _showTip(dot, index) {
            const msg = this.userMessages[index];
            if (!msg) return;
            let text = this.adapter.getText(msg);
            if (text.length > 60) text = text.substring(0, 60) + '…';
            if (!text) text = `Message ${index + 1}`;

            this.tip.textContent = `#${index + 1}: ${text}`;
            this.tip.classList.add('visible');

            const dotRect = dot.getBoundingClientRect();
            const tipRect = this.tip.getBoundingClientRect();
            let top = dotRect.top + dotRect.height / 2 - tipRect.height / 2;
            top = Math.max(4, Math.min(top, window.innerHeight - tipRect.height - 4));
            let left = dotRect.left - tipRect.width - 10;
            if (left < 4) left = dotRect.right + 10;

            this.tip.style.top = `${top}px`;
            this.tip.style.left = `${left}px`;

            if (this.tipTimer) clearTimeout(this.tipTimer);
        }

        _hideTip() {
            this.tipTimer = setTimeout(() => {
                this.tip.classList.remove('visible');
            }, 80);
        }

        _syncActive() {
            if (!this.scrollContainer || this.userMessages.length === 0) return;

            let activeIdx = -1;
            const scrollTop = this.scrollContainer === document.documentElement || this.scrollContainer === document.body
                ? window.scrollY
                : this.scrollContainer.scrollTop;

            for (let i = this.userMessages.length - 1; i >= 0; i--) {
                const msg = this.userMessages[i];
                if (!msg.isConnected) continue;
                const rect = msg.getBoundingClientRect();
                const containerRect = this.scrollContainer.getBoundingClientRect
                    ? this.scrollContainer.getBoundingClientRect()
                    : { top: 0 };
                if (rect.top <= containerRect.top + 150) {
                    activeIdx = i;
                    break;
                }
            }

            if (activeIdx === -1 && this.userMessages.length > 0) activeIdx = 0;

            if (activeIdx !== this.activeIndex) {
                if (this.activeIndex >= 0 && this.activeIndex < this.dots.length) {
                    this.dots[this.activeIndex].classList.remove('active');
                }
                this.activeIndex = activeIdx;
                if (activeIdx >= 0 && activeIdx < this.dots.length) {
                    this.dots[activeIdx].classList.add('active');
                }
            }
        }

        _bindEvents() {
            let rafPending = false;
            this.scrollHandler = () => {
                if (rafPending) return;
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    this._syncActive();
                });
            };

            if (this.scrollContainer === document.documentElement || this.scrollContainer === document.body) {
                window.addEventListener('scroll', this.scrollHandler, { passive: true });
            } else {
                this.scrollContainer.addEventListener('scroll', this.scrollHandler, { passive: true });
            }

            this._resizeHandler = () => {
                requestAnimationFrame(() => this._syncActive());
            };
            window.addEventListener('resize', this._resizeHandler, { passive: true });
        }

        _observeDom() {
            let debounceTimer = null;
            this.observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const newMsgs = document.querySelectorAll(this.adapter.userSelector);
                    if (newMsgs.length !== this.userMessages.length) {
                        this._renderDots();
                    }
                }, 600);
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        }

        _toggle() {
            this.isCollapsed = !this.isCollapsed;
            if (this.isCollapsed) {
                this.wrapper.classList.add('hidden');
                this.toggleBtn.innerHTML = '»';
                this.toggleBtn.classList.add('visible');
            } else {
                this.wrapper.classList.remove('hidden');
                this.toggleBtn.innerHTML = '«';
                this.toggleBtn.classList.remove('visible');
            }
        }

        _onUrlChange() {
            // Re-check if still on a conversation page
            setTimeout(() => {
                if (this.adapter.isConversation()) {
                    this._renderDots();
                } else {
                    this.wrapper.classList.add('hidden');
                }
            }, 500);
        }

        destroy() {
            if (this.observer) this.observer.disconnect();
            if (this._urlCheckInterval) clearInterval(this._urlCheckInterval);
            if (this.scrollHandler) {
                window.removeEventListener('scroll', this.scrollHandler);
                if (this.scrollContainer && this.scrollContainer !== document.documentElement) {
                    this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
                }
            }
            if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
            if (this.wrapper) this.wrapper.remove();
            if (this.toggleBtn) this.toggleBtn.remove();
            if (this.tip) this.tip.remove();
        }
    }

    // ============================================================
    //  Initialize timeline
    // ============================================================
    let timeline = null;

    function initTimeline() {
        const adapter = detectAdapter();
        if (!adapter) return;
        if (!adapter.isConversation()) {
            // Retry later — SPA might not have loaded conversation yet
            setTimeout(() => {
                if (adapter.isConversation()) {
                    timeline = new CopyTexTimeline(adapter);
                    timeline.init();
                }
            }, 2000);
            return;
        }
        timeline = new CopyTexTimeline(adapter);
        timeline.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTimeline, { once: true });
    } else {
        // Small delay to let SPA routing complete
        setTimeout(initTimeline, 500);
    }

    window.addEventListener('beforeunload', () => {
        if (timeline) timeline.destroy();
    });

})();
