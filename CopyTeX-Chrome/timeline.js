// CopyTeX - Timeline
// Interactive conversation navigation sidebar for AI chat platforms
// Dots are distributed proportionally based on actual message positions (like AITimeline)

(function () {
    'use strict';

    const TRACK_PADDING = 14;   // px padding top/bottom inside the bar
    const MIN_DOT_GAP = 18;     // minimum px gap between dots

    // ============================================================
    //  Platform adapters — selectors for user messages per site
    // ============================================================
    const TIMELINE_ADAPTERS = {
        chatgpt: {
            hosts: ['chatgpt.com', 'chat.openai.com'],
            userSelector: '[data-message-author-role="user"]',
            position: { top: 70, right: 16, bottom: 140 },
            getText: el => {
                const article = el.closest('article') || el.closest('[data-testid^="conversation-turn"]') || el;
                const c = article.querySelector('.whitespace-pre-wrap') || el;
                return (c.textContent || '').trim();
            },
            isConversation: () => /\/c\//.test(location.pathname) || document.querySelector('[data-message-author-role]'),
            getScrollContainer: () => findScrollable(document.querySelector('main'))
        },
        gemini: {
            hosts: ['gemini.google.com'],
            userSelector: 'user-query, .user-query, .query-content',
            position: { top: 70, right: 16, bottom: 160 },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => /\/app\//.test(location.pathname) || document.querySelector('user-query, .user-query'),
            getScrollContainer: () => findScrollable(document.querySelector('.conversation-container, main'))
        },
        deepseek: {
            hosts: ['chat.deepseek.com'],
            userSelector: '[class*="chat-message"][class*="user"], [data-role="user"], [class*="msg-item"][class*="user"]',
            position: { top: 70, right: 16, bottom: 140 },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="chat-message"], [class*="msg-item"]'),
            getScrollContainer: () => findScrollable(document.querySelector('[class*="chat-container"], main'))
        },
        claude: {
            hosts: ['claude.ai'],
            userSelector: '[data-testid="user-message"], [class*="human-message"], [class*="user-message"]',
            position: { top: 60, right: 16, bottom: 140 },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => /\/chat\//.test(location.pathname) || document.querySelector('[data-testid="user-message"]'),
            getScrollContainer: () => findScrollable(document.querySelector('main, [class*="conversation"]'))
        },
        grok: {
            hosts: ['grok.com'],
            userSelector: '[class*="message"][class*="user"], [class*="human"]',
            position: { top: 70, right: 16, bottom: 140 },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="message"]'),
            getScrollContainer: () => document.scrollingElement || document.documentElement
        },
        kimi: {
            hosts: ['kimi.ai', 'kimi.moonshot.cn'],
            userSelector: '[class*="chat-message"][class*="user"], [data-role="user"]',
            position: { top: 70, right: 16, bottom: 140 },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="chat-message"]'),
            getScrollContainer: () => document.scrollingElement || document.documentElement
        },
        poe: {
            hosts: ['poe.com'],
            userSelector: '[class*="Message"][class*="human"], [class*="Message"][class*="Human"]',
            position: { top: 70, right: 16, bottom: 140 },
            getText: el => (el.textContent || '').trim(),
            isConversation: () => document.querySelector('[class*="Message"]'),
            getScrollContainer: () => document.scrollingElement || document.documentElement
        }
    };

    function findScrollable(startEl) {
        let el = startEl;
        while (el && el !== document.body) {
            const s = getComputedStyle(el).overflowY;
            if (s === 'auto' || s === 'scroll') return el;
            el = el.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function detectAdapter() {
        const hostname = location.hostname;
        for (const [id, adapter] of Object.entries(TIMELINE_ADAPTERS)) {
            if (adapter.hosts.some(h => hostname.includes(h))) {
                return { id, ...adapter };
            }
        }
        return null;
    }

    // ============================================================
    //  Min-gap enforcement (from AITimeline)
    //  Ensures dots don't overlap by enforcing minimum pixel distance
    // ============================================================
    function applyMinGap(positions, minTop, maxTop, gap) {
        const n = positions.length;
        if (n === 0) return positions;
        const out = positions.slice();
        // Clamp + forward pass
        out[0] = Math.max(minTop, Math.min(out[0], maxTop));
        for (let i = 1; i < n; i++) {
            out[i] = Math.max(out[i], out[i - 1] + gap);
        }
        // If last exceeds max, backward pass
        if (out[n - 1] > maxTop) {
            out[n - 1] = maxTop;
            for (let i = n - 2; i >= 0; i--) {
                out[i] = Math.min(out[i], out[i + 1] - gap);
            }
            if (out[0] < minTop) {
                out[0] = minTop;
                for (let i = 1; i < n; i++) {
                    out[i] = Math.max(out[i], out[i - 1] + gap);
                }
            }
        }
        for (let i = 0; i < n; i++) {
            out[i] = Math.max(minTop, Math.min(out[i], maxTop));
        }
        return out;
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
            this.tip = null;
            this.markers = [];       // { element, dotElement, visualN, dotTopPx, text }
            this.activeIndex = -1;
            this.scrollContainer = null;
            this.observer = null;
            this.scrollHandler = null;
            this.isCollapsed = false;
            this.tipTimer = null;
            this._lastUrl = location.href;
            this._urlCheckInterval = null;
            this._resizeHandler = null;
            this._barHeight = 0;
        }

        async init() {
            const found = await this._waitForMessages(8000);
            if (!found) return;

            this.scrollContainer = this.adapter.getScrollContainer();
            if (!this.scrollContainer) return;

            this._injectUI();
            this._recalcAndRender();
            this._bindEvents();
            this._observeDom();

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
                    if (msgs.length > 0) { resolve(true); return true; }
                    return false;
                };
                if (check()) return;
                const start = Date.now();
                const iv = setInterval(() => {
                    if (check()) { clearInterval(iv); return; }
                    if (Date.now() - start > timeout) { clearInterval(iv); resolve(false); }
                }, 400);
            });
        }

        // ---- UI injection ----
        _injectUI() {
            const pos = this.adapter.position;

            // Wrapper — fixed, spanning from top to bottom
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'copytex-timeline-wrapper';
            this.wrapper.style.top = pos.top + 'px';
            this.wrapper.style.right = pos.right + 'px';
            this.wrapper.style.left = 'auto';

            // Bar — explicit height = viewport - top - bottom
            this.bar = document.createElement('div');
            this.bar.className = 'copytex-timeline-bar';
            this._updateBarHeight();

            // Track (same height as bar, relative container for absolute dots)
            this.track = document.createElement('div');
            this.track.className = 'copytex-timeline-track';

            this.bar.appendChild(this.track);
            this.wrapper.appendChild(this.bar);
            document.body.appendChild(this.wrapper);

            // Tooltip
            this.tip = document.createElement('div');
            this.tip.className = 'copytex-timeline-tip';
            document.body.appendChild(this.tip);

        }

        _updateBarHeight() {
            const pos = this.adapter.position;
            const h = window.innerHeight - pos.top - pos.bottom;
            this._barHeight = Math.max(60, h);
            this.bar.style.height = this._barHeight + 'px';
        }

        // ---- Core: calculate positions and render dots ----
        _recalcAndRender() {
            // Gather user messages
            const msgElements = Array.from(document.querySelectorAll(this.adapter.userSelector));
            if (msgElements.length === 0) {
                this.track.innerHTML = '';
                this.markers = [];
                return;
            }

            // Get offset of each message relative to scroll container's content top
            const sc = this.scrollContainer;
            const isDocScroll = (sc === document.documentElement || sc === document.body);

            const getOffsetTop = (el) => {
                const elRect = el.getBoundingClientRect();
                if (isDocScroll) {
                    return elRect.top + window.scrollY;
                }
                const cRect = sc.getBoundingClientRect();
                return elRect.top - cRect.top + sc.scrollTop;
            };

            // Sort by position (top to bottom)
            const sorted = msgElements.slice().sort((a, b) => {
                return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
            });

            const offsets = sorted.map(el => getOffsetTop(el));
            const firstOffset = offsets[0];
            const lastOffset = offsets[offsets.length - 1];
            const contentSpan = Math.max(1, lastOffset - firstOffset);

            // Compute visualN (0~1) for each message
            const visualNs = offsets.map(off => {
                const n = (off - firstOffset) / contentSpan;
                return Math.max(0, Math.min(1, n));
            });

            // Update bar height
            this._updateBarHeight();

            // Map visualN to pixel positions within the track
            const usable = Math.max(1, this._barHeight - 2 * TRACK_PADDING);
            const minTop = TRACK_PADDING;
            const maxTop = TRACK_PADDING + usable;

            const desiredPx = visualNs.map(vn => minTop + vn * usable);
            const adjustedPx = applyMinGap(desiredPx, minTop, maxTop, MIN_DOT_GAP);

            // Clear old dots
            this.track.innerHTML = '';
            this.markers = [];

            sorted.forEach((msg, i) => {
                const dot = document.createElement('button');
                dot.className = 'copytex-timeline-dot';
                dot.style.top = adjustedPx[i] + 'px';
                dot.setAttribute('aria-label', this.adapter.getText(msg));
                dot.dataset.index = i;

                dot.addEventListener('click', () => this._scrollToMessage(i));
                dot.addEventListener('mouseenter', () => this._showTip(dot, i));
                dot.addEventListener('mouseleave', () => this._hideTip());

                this.track.appendChild(dot);
                this.markers.push({
                    element: msg,
                    dotElement: dot,
                    visualN: visualNs[i],
                    dotTopPx: adjustedPx[i],
                    offsetTop: offsets[i]
                });
            });

            this._syncActive();
        }

        _scrollToMessage(index) {
            const m = this.markers[index];
            if (!m || !m.element || !m.element.isConnected) return;

            m.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight flash
            const orig = m.element.style.backgroundColor;
            m.element.style.transition = 'background-color 0.3s ease';
            m.element.style.backgroundColor = 'rgba(127, 45, 156, 0.08)';
            setTimeout(() => { m.element.style.backgroundColor = orig; }, 1200);
        }

        _showTip(dot, index) {
            const m = this.markers[index];
            if (!m) return;
            let text = this.adapter.getText(m.element);
            if (text.length > 60) text = text.substring(0, 60) + '…';
            if (!text) text = `Message ${index + 1}`;

            this.tip.textContent = `#${index + 1}: ${text}`;
            this.tip.classList.add('visible');

            const dotRect = dot.getBoundingClientRect();
            this.tip.style.visibility = 'hidden';
            this.tip.style.display = 'block';
            const tipRect = this.tip.getBoundingClientRect();
            this.tip.style.visibility = '';

            let top = dotRect.top + dotRect.height / 2 - tipRect.height / 2;
            top = Math.max(4, Math.min(top, window.innerHeight - tipRect.height - 4));
            let left = dotRect.left - tipRect.width - 12;
            if (left < 4) left = dotRect.right + 12;

            this.tip.style.top = `${top}px`;
            this.tip.style.left = `${left}px`;

            if (this.tipTimer) clearTimeout(this.tipTimer);
        }

        _hideTip() {
            this.tipTimer = setTimeout(() => {
                this.tip.classList.remove('visible');
            }, 80);
        }

        // ---- Active dot sync (scroll-based) ----
        _syncActive() {
            if (!this.scrollContainer || this.markers.length === 0) return;

            const sc = this.scrollContainer;
            const isDoc = (sc === document.documentElement || sc === document.body);

            let activeIdx = -1;
            for (let i = this.markers.length - 1; i >= 0; i--) {
                const msg = this.markers[i].element;
                if (!msg.isConnected) continue;
                const rect = msg.getBoundingClientRect();
                const containerTop = isDoc ? 0 : sc.getBoundingClientRect().top;
                // Consider a message "active" if its top is within upper 40% of visible area
                if (rect.top <= containerTop + window.innerHeight * 0.4) {
                    activeIdx = i;
                    break;
                }
            }
            if (activeIdx === -1 && this.markers.length > 0) activeIdx = 0;

            if (activeIdx !== this.activeIndex) {
                if (this.activeIndex >= 0 && this.activeIndex < this.markers.length) {
                    this.markers[this.activeIndex].dotElement.classList.remove('active');
                }
                this.activeIndex = activeIdx;
                if (activeIdx >= 0 && activeIdx < this.markers.length) {
                    this.markers[activeIdx].dotElement.classList.add('active');
                }
            }
        }

        // ---- Events ----
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

            const sc = this.scrollContainer;
            if (sc === document.documentElement || sc === document.body) {
                window.addEventListener('scroll', this.scrollHandler, { passive: true });
            } else {
                sc.addEventListener('scroll', this.scrollHandler, { passive: true });
            }

            this._resizeHandler = () => {
                requestAnimationFrame(() => {
                    this._updateBarHeight();
                    this._recalcAndRender();
                });
            };
            window.addEventListener('resize', this._resizeHandler, { passive: true });
        }

        _observeDom() {
            let debounceTimer = null;
            this.observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const newMsgs = document.querySelectorAll(this.adapter.userSelector);
                    if (newMsgs.length !== this.markers.length) {
                        this._recalcAndRender();
                    }
                }, 800);
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        }

        _onUrlChange() {
            setTimeout(() => {
                if (this.adapter.isConversation()) {
                    this.scrollContainer = this.adapter.getScrollContainer();
                    this._recalcAndRender();
                    this.wrapper.classList.remove('hidden');
                } else {
                    this.wrapper.classList.add('hidden');
                }
            }, 600);
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
        setTimeout(initTimeline, 500);
    }

    window.addEventListener('beforeunload', () => {
        if (timeline) timeline.destroy();
    });

})();
