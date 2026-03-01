// CopyTeX - Conversation Exporter
// Export AI chat conversations from supported platforms as Markdown or JSON

(function () {
    'use strict';

    // Cross-browser API compatibility
    const browserAPI = (() => {
        if (typeof browser !== 'undefined') return browser;
        if (typeof chrome !== 'undefined') return chrome;
        return null;
    })();

    // --- Platform Detection ---
    const EXPORT_PLATFORMS = {
        chatgpt: {
            hosts: ['chat.openai.com', 'chatgpt.com'],
            name: 'ChatGPT',
            icon: '🤖'
        },
        gemini: {
            hosts: ['gemini.google.com'],
            name: 'Gemini',
            icon: '✨'
        },
        deepseek: {
            hosts: ['chat.deepseek.com'],
            name: 'DeepSeek',
            icon: '🐋'
        },
        claude: {
            hosts: ['claude.ai'],
            name: 'Claude',
            icon: '🟠'
        },
        grok: {
            hosts: ['grok.com', 'x.com/i/grok'],
            name: 'Grok',
            icon: '⚡'
        },
        kimi: {
            hosts: ['kimi.ai', 'kimi.moonshot.cn'],
            name: 'Kimi',
            icon: '🌙'
        },
        poe: {
            hosts: ['poe.com'],
            name: 'Poe',
            icon: '💬'
        },
        doubao: {
            hosts: ['www.doubao.com', 'doubao.com'],
            name: 'Doubao',
            icon: '🫘'
        },
        qianwen: {
            hosts: ['www.qianwen.com', 'qianwen.com', 'tongyi.aliyun.com'],
            name: 'Qianwen',
            icon: '🔮'
        }
    };

    function detectPlatform() {
        const hostname = window.location.hostname;
        const fullUrl = window.location.href;
        for (const [id, config] of Object.entries(EXPORT_PLATFORMS)) {
            if (config.hosts.some(h => hostname.includes(h) || fullUrl.includes(h))) {
                return { id, ...config };
            }
        }
        return null;
    }

    function getConversationTitle() {
        let title = document.title || '';
        // Clean up platform-specific suffixes/prefixes
        title = title
            .replace(/\s*[-–|·]\s*(ChatGPT|Google Gemini|Gemini|DeepSeek|DeepSeek Chat|Claude|Grok|Kimi|Poe|豆包|Doubao|通义千问|千问|Qianwen|Qwen).*$/i, '')
            .replace(/^(ChatGPT|Google Gemini|Gemini|DeepSeek|Claude|Grok|Kimi|Poe|豆包|Doubao|通义千问|千问|Qianwen|Qwen)\s*[-–|·]\s*/i, '')
            .replace(/^\u200E+/, '')
            .trim();

        // If after cleanup the title is exactly a platform name (or empty),
        // treat it as no title so platform-specific fallback logic can run.
        const platformOnlyNames = /^(ChatGPT|Google Gemini|Gemini|DeepSeek|DeepSeek Chat|Claude|Grok|Kimi|Poe|豆包|Doubao|通义千问|千问|Qianwen|Qwen|豆包\s*[-–]\s*字节跳动旗下\s*AI\s*智能助手|千问-Qwen最新模型体验-通义千问官网)$/i;
        if (platformOnlyNames.test(title)) {
            title = '';
        }

        const platform = detectPlatform();

        if (!title && platform?.id === 'gemini') {
            // Gemini's document.title is just "Google Gemini" without the conversation name.
            // The active conversation in the sidebar carries a "selected" CSS class.
            const activeSelectors = [
                'a.conversation.selected',
                'a.selected[href*="/app/"]',
                'a[href*="/app/"].active',
                'a[href*="/app/"][aria-selected="true"]',
            ];
            for (const sel of activeSelectors) {
                const el = document.querySelector(sel);
                if (el?.textContent?.trim()) {
                    title = el.textContent.trim();
                    break;
                }
            }
            // Match current URL path to find the corresponding sidebar link
            if (!title) {
                const pathMatch = location.pathname.match(/\/app\/([^/?#]+)/);
                if (pathMatch) {
                    const link = document.querySelector(`a[href*="/app/${pathMatch[1]}"]`);
                    if (link?.textContent?.trim()) {
                        title = link.textContent.trim();
                    }
                }
            }
            // Last resort: use the first user message (truncated) as the title
            if (!title) {
                const firstUser = document.querySelector('user-query, .user-query');
                if (firstUser) {
                    const inner = firstUser.querySelector('.query-text, [class*="query-text"], .query-content') || firstUser;
                    let raw = (inner.textContent || '').trim();
                    raw = raw.replace(/^(你说[：: ]?|You said[: ]?)/i, '').trim();
                    if (raw) title = raw.length > 50 ? raw.substring(0, 50) : raw;
                }
            }
        }

        // Doubao: title is generic "豆包 - 字节跳动旗下 AI 智能助手"
        if (!title && platform?.id === 'doubao') {
            const pathMatch = location.pathname.match(/\/chat\/(\d+)/);
            if (pathMatch) {
                const link = document.querySelector(`a[href*="/chat/${pathMatch[1]}"]`);
                if (link?.textContent?.trim()) {
                    title = link.textContent.trim();
                }
            }
            if (!title) {
                const firstSend = document.querySelector('[class*="container-QQkdo4"]');
                if (firstSend) {
                    const raw = (firstSend.textContent || '').trim();
                    if (raw) title = raw.length > 50 ? raw.substring(0, 50) : raw;
                }
            }
        }

        // Qianwen: title is generic "千问-Qwen最新模型体验-通义千问官网"
        if (!title && platform?.id === 'qianwen') {
            const firstBubble = document.querySelector('[class*="bubble-"]');
            if (firstBubble) {
                const raw = (firstBubble.textContent || '').trim();
                if (raw) title = raw.length > 50 ? raw.substring(0, 50) : raw;
            }
        }

        return title || (platform ? `${platform.name} Conversation` : 'AI Conversation');
    }

    // --- HTML to Markdown Conversion ---

    function extractMathLatex(element) {
        if (!(element instanceof Element)) return null;
        // Try KaTeX annotation
        const annotation = element.querySelector('annotation[encoding*="tex"], annotation[encoding*="TeX"]');
        if (annotation && annotation.textContent?.trim()) {
            return annotation.textContent.trim();
        }
        // Try data attributes
        for (const attr of ['data-math', 'data-latex', 'data-tex', 'data-katex', 'data-original']) {
            const container = element.closest(`[${attr}]`) || element;
            const val = container.getAttribute(attr);
            if (val?.trim()) return val.trim();
        }
        return null;
    }

    function convertTableToMarkdown(table) {
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) return '';
        const lines = [];
        rows.forEach((row, i) => {
            const cells = Array.from(row.querySelectorAll('th, td'));
            const line = '| ' + cells.map(c => c.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |';
            lines.push(line);
            if (i === 0) {
                lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
            }
        });
        return lines.join('\n');
    }

    function elementToMarkdown(node) {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node;
        const tag = el.tagName.toLowerCase();

        // Skip hidden, script, style, svg, button elements
        if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'noscript') return '';
        if (el.hidden || el.getAttribute('aria-hidden') === 'true') return '';
        const style = el.style;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return '';

        // Skip DeepSeek thinking/reasoning blocks (chain-of-thought should not appear in export)
        const cls = el.className || '';
        if (typeof cls === 'string' && (
            cls.includes('thinking') || cls.includes('think-block') ||
            cls.includes('ds-think') || cls.includes('reasoning') ||
            cls.includes('chain-of-thought')
        )) return '';

        // Handle math elements — preserve LaTeX
        if (el.classList.contains('katex') || el.classList.contains('katex-display') ||
            el.classList.contains('math-inline') || el.classList.contains('math-block') ||
            el.classList.contains('math-display') || el.classList.contains('katex-mathml')) {
            const latex = extractMathLatex(el);
            if (latex) {
                const isDisplay = el.classList.contains('katex-display') ||
                    el.classList.contains('math-block') ||
                    el.classList.contains('math-display');
                return isDisplay ? `\n$$\n${latex}\n$$\n` : `$${latex}$`;
            }
        }

        // Handle MathJax
        if (el.classList.contains('MathJax') || el.classList.contains('mjx-container') || el.classList.contains('mjx-chtml')) {
            const latex = extractMathLatex(el);
            if (latex) {
                const isDisplay = el.getAttribute('display') === 'block';
                return isDisplay ? `\n$$\n${latex}\n$$\n` : `$${latex}$`;
            }
        }

        // Handle pre/code blocks — don't recurse, use textContent directly
        if (tag === 'pre') {
            const codeEl = el.querySelector('code');
            if (codeEl) {
                const lang = (codeEl.className || '').match(/language-(\w+)/)?.[1] || '';
                return '\n```' + lang + '\n' + codeEl.textContent + '\n```\n\n';
            }
            return '\n```\n' + el.textContent + '\n```\n\n';
        }

        // Skip copy buttons and similar UI elements
        if (tag === 'button' || el.getAttribute('role') === 'button') return '';
        if (el.classList.contains('copy-button') || el.classList.contains('code-copy')) return '';

        // Recurse into children
        const childMd = Array.from(el.childNodes).map(elementToMarkdown).join('');

        switch (tag) {
            case 'p': return childMd.trim() + '\n\n';
            case 'br': return '\n';
            case 'strong': case 'b': return `**${childMd.trim()}**`;
            case 'em': case 'i': return `*${childMd.trim()}*`;
            case 'code':
                // Inline code only (pre>code handled above)
                if (el.parentElement?.tagName?.toLowerCase() === 'pre') return '';
                return '`' + el.textContent + '`';
            case 'h1': return `# ${childMd.trim()}\n\n`;
            case 'h2': return `## ${childMd.trim()}\n\n`;
            case 'h3': return `### ${childMd.trim()}\n\n`;
            case 'h4': return `#### ${childMd.trim()}\n\n`;
            case 'h5': return `##### ${childMd.trim()}\n\n`;
            case 'h6': return `###### ${childMd.trim()}\n\n`;
            case 'ul': return '\n' + childMd + '\n';
            case 'ol': return '\n' + childMd + '\n';
            case 'li': {
                const parent = el.parentElement;
                if (parent?.tagName?.toLowerCase() === 'ol') {
                    const idx = Array.from(parent.children).indexOf(el) + 1;
                    return `${idx}. ${childMd.trim()}\n`;
                }
                return `- ${childMd.trim()}\n`;
            }
            case 'a': {
                const href = el.getAttribute('href');
                const text = childMd.trim();
                return href && text ? `[${text}](${href})` : text;
            }
            case 'img': {
                const alt = el.getAttribute('alt') || 'image';
                const src = el.getAttribute('src') || '';
                return `![${alt}](${src})`;
            }
            case 'blockquote':
                return '\n> ' + childMd.trim().replace(/\n/g, '\n> ') + '\n\n';
            case 'table':
                return '\n' + convertTableToMarkdown(el) + '\n\n';
            case 'hr': return '\n---\n\n';
            case 'del': case 's': return `~~${childMd.trim()}~~`;
            case 'mark': return `==${childMd.trim()}==`;
            case 'details': {
                const summary = el.querySelector('summary');
                const summaryText = summary ? summary.textContent.trim() : 'Details';
                return `\n<details>\n<summary>${summaryText}</summary>\n\n${childMd}\n</details>\n\n`;
            }
            case 'summary': return '';
            default: return childMd;
        }
    }

    function extractRichContent(element) {
        if (!element) return '';
        let md = elementToMarkdown(element);
        md = md.replace(/\n{3,}/g, '\n\n');
        md = md.replace(/^\s+/, '').replace(/\s+$/, '');
        return md;
    }

    // --- Platform-specific Message Extractors ---

    function extractChatGPTMessages() {
        const messages = [];

        // Strategy 1: data-message-author-role (most reliable)
        const roleElements = document.querySelectorAll('[data-message-author-role]');
        if (roleElements.length > 0) {
            roleElements.forEach(el => {
                const role = el.getAttribute('data-message-author-role');
                if (role === 'system' || role === 'tool') return;

                const article = el.closest('article')
                    || el.closest('[data-testid^="conversation-turn"]')
                    || el.parentElement;
                const contentEl = article?.querySelector('.markdown.prose')
                    || article?.querySelector('.markdown')
                    || article?.querySelector('.whitespace-pre-wrap')
                    || article?.querySelector('[data-message-content]');
                if (!contentEl) return;

                const content = role === 'user'
                    ? contentEl.innerText?.trim()
                    : extractRichContent(contentEl);
                if (content) {
                    messages.push({ role: role === 'user' ? 'user' : 'assistant', content });
                }
            });
            return messages;
        }

        // Strategy 2: conversation-turn test IDs
        const turns = document.querySelectorAll('[data-testid^="conversation-turn"]');
        if (turns.length > 0) {
            turns.forEach(turn => {
                const userEl = turn.querySelector('[data-message-author-role="user"]');
                const contentEl = turn.querySelector('.markdown.prose')
                    || turn.querySelector('.markdown')
                    || turn.querySelector('.whitespace-pre-wrap');
                if (!contentEl) return;
                const role = userEl ? 'user' : 'assistant';
                const content = role === 'user'
                    ? contentEl.innerText?.trim()
                    : extractRichContent(contentEl);
                if (content) messages.push({ role, content });
            });
        }

        return messages;
    }

    function extractGeminiMessages() {
        const messages = [];

        // Helper: extract LaTeX-preserving content from a user-query element.
        // Gemini renders user messages with KaTeX, so we use extractRichContent
        // instead of innerText to avoid broken formula fragments.
        function extractGeminiUserContent(el) {
            // Prefer the inner query-text container which holds the actual text/formula nodes.
            const inner = el.querySelector('.query-text, [class*="query-text"]') || el;
            // Use extractRichContent to preserve any KaTeX / math-inline elements.
            let content = extractRichContent(inner);
            if (!content) {
                content = inner.innerText?.trim() || '';
            }
            // Strip Gemini's "你说" / "You said" label that gets captured alongside the query text
            content = content.replace(/^(你说[：:\s]?|You said[:\s]?)/i, '').trim();
            return content;
        }

        function cleanGeminiAssistantContent(content) {
            // Remove "Gemini 说" / "Gemini said" headings injected by Gemini UI
            content = content.replace(/^#{1,3}\s*Gemini\s*(说|said)\s*\n*/i, '').trim();
            return content;
        }

        // Strategy 1: Interleave user-query and model-response custom elements.
        // These are the most reliable top-level semantic elements on Gemini.
        // We collect both sets, tag each with its role + DOM position, then sort.
        const userQueryEls = Array.from(document.querySelectorAll('user-query, .user-query'));
        const modelResponseEls = Array.from(document.querySelectorAll('model-response, .model-response'));

        if (userQueryEls.length > 0 || modelResponseEls.length > 0) {
            const all = [];
            userQueryEls.forEach(el => all.push({ el, role: 'user' }));
            modelResponseEls.forEach(el => all.push({ el, role: 'assistant' }));
            // Sort by DOM position (ensures correct interleaving regardless of query count)
            all.sort((a, b) =>
                a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
            );
            // Deduplicate: skip elements that are descendants of already-added elements
            const seen = new Set();
            all.forEach(({ el, role }) => {
                // Skip if any previously seen element contains this one
                for (const s of seen) {
                    if (s.contains(el)) return;
                }
                seen.add(el);
                let content;
                if (role === 'user') {
                    content = extractGeminiUserContent(el);
                } else {
                    // Prefer the markdown panel inside model-response
                    const mdPanel = el.querySelector('.markdown-main-panel, .model-response-text, .response-content, [class*="response-content"]') || el;
                    content = cleanGeminiAssistantContent(extractRichContent(mdPanel));
                }
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 2: Explicit conversation turns with query + response children
        const turns = document.querySelectorAll('.conversation-turn, [class*="turn-content"]');
        if (turns.length > 0) {
            turns.forEach(turn => {
                // Prioritise more specific selectors over generic [class*="query"]
                const queryEl = turn.querySelector('.query-text, .query-content, [class*="query-text"]');
                const responseEl = turn.querySelector('.model-response-text, .response-content, [class*="model-response"], .markdown-main-panel');
                if (queryEl) {
                    let content = extractRichContent(queryEl);
                    if (content) {
                        content = content.replace(/^(你说[：:\s]?|You said[:\s]?)/i, '').trim();
                        if (content) messages.push({ role: 'user', content });
                    }
                }
                if (responseEl) {
                    const content = cleanGeminiAssistantContent(extractRichContent(responseEl));
                    if (content) messages.push({ role: 'assistant', content });
                }
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 3: message-content custom elements (alternate Gemini layout)
        const messageContents = Array.from(document.querySelectorAll('message-content'));
        if (messageContents.length > 0) {
            // Determine role from parent custom element tag when possible
            messageContents.forEach(mc => {
                const parentTag = mc.parentElement?.tagName?.toLowerCase() || '';
                let role;
                if (parentTag === 'user-query' || parentTag.includes('user')) {
                    role = 'user';
                } else if (parentTag === 'model-response' || parentTag.includes('model') || parentTag.includes('response')) {
                    role = 'assistant';
                } else {
                    return; // cannot determine role
                }
                const content = role === 'user'
                    ? extractGeminiUserContent(mc)
                    : cleanGeminiAssistantContent(extractRichContent(mc));
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 4: Generic turn detection via alternating blocks
        return extractGenericMessages();
    }

    // DeepSeek wraps its "thinking" (chain-of-thought) in a separate container.
    // We must skip that block and only export the actual answer.
    function extractDeepSeekAnswer(msgEl) {
        // Clone so we can safely remove nodes without affecting the live DOM
        const clone = msgEl.cloneNode(true);

        // Remove thinking/reasoning blocks
        // DeepSeek uses class names like "ds-thinking", "_thinking_", "thinking-block", etc.
        const thinkSelectors = [
            '[class*="thinking"]',
            '[class*="think-block"]',
            '[class*="ds-think"]',
            '[class*="reasoning"]',
            '[class*="chain-of-thought"]',
            'details',          // thinking is often hidden inside <details>
        ];
        thinkSelectors.forEach(sel => {
            clone.querySelectorAll(sel).forEach(el => el.remove());
        });

        // Now find the markdown answer content
        const answerEl = clone.querySelector('.ds-markdown, .markdown-body, .markdown, [class*="message-content"], [class*="msg-content"]')
            || clone;
        return extractRichContent(answerEl);
    }

    function extractDeepSeekMessages() {
        const messages = [];

        // ── Strategy 1: Use .ds-message elements directly.
        //
        // DeepSeek DOM (observed Mar 2026):
        //
        //  div.dad65929                           ← conversation turn container
        //    ├─ div.d29f3d7d.ds-message           ← user message (no .ds-markdown)
        //    │    └─ div.fbb737a4                  ← actual user text
        //    ├─ div._4f9bf79._43c05b5             ← assistant wrapper
        //    │    └─ div.ds-message                ← assistant (has .ds-markdown)
        //    │         ├─ div.ds-think-content     ← thinking (skip)
        //    │         └─ div.ds-markdown           ← answer
        //    ├─ div.d29f3d7d.ds-message           ← next user message
        //    ├─ div._4f9bf79._43c05b5             ← next assistant wrapper
        //    │    └─ div.ds-message                ← ...
        //    └─ ...
        //
        // All .ds-message elements appear in correct DOM order.
        // User messages: .ds-message WITHOUT .ds-markdown descendant.
        // Assistant messages: .ds-message WITH .ds-markdown descendant.

        const allDsMessages = Array.from(document.querySelectorAll('.ds-message'));

        if (allDsMessages.length > 0) {
            // Deduplicate: a user .ds-message is never nested inside another
            // .ds-message, but an assistant .ds-message IS nested inside the
            // _4f9bf79 wrapper. Filter out any .ds-message that is an ancestor
            // of another .ds-message (shouldn't happen, but be safe).
            const filtered = allDsMessages.filter((el, idx) => {
                return !allDsMessages.some((other, j) => j !== idx && el.contains(other) && el !== other);
            });

            filtered.forEach(el => {
                const hasMarkdown = !!el.querySelector('.ds-markdown');
                if (hasMarkdown) {
                    const content = extractDeepSeekAnswer(el);
                    if (content) messages.push({ role: 'assistant', content });
                } else {
                    const inner = el.querySelector('[class*="fbb737a4"]') || el;
                    const text = inner.innerText?.trim();
                    if (text && text.length > 0) {
                        messages.push({ role: 'user', content: text });
                    }
                }
            });

            if (messages.length > 0) return messages;
        }

        // ── Strategy 2: data-role attributes
        const byDataRole = Array.from(document.querySelectorAll('[data-role]'));
        if (byDataRole.length > 0) {
            byDataRole.forEach(el => {
                const role = el.getAttribute('data-role');
                if (role !== 'user' && role !== 'assistant') return;
                let content;
                if (role === 'user') {
                    const inner = el.querySelector('[class*="message-content"], [class*="msg-content"], [class*="user-input"]') || el;
                    content = inner.innerText?.trim();
                } else {
                    content = extractDeepSeekAnswer(el);
                }
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        // ── Strategy 3: .ds-markdown elements with sibling-based user discovery
        if (dsMarkdowns.length > 0) {
            const allTurns = [];
            const seenEls = new Set();

            dsMarkdowns.forEach(md => {
                // Walk up to find the turn-level parent
                let turnEl = md.parentElement;
                for (let i = 0; i < 8 && turnEl && turnEl !== document.body; i++) {
                    if (turnEl.previousElementSibling || turnEl.nextElementSibling) break;
                    turnEl = turnEl.parentElement;
                }
                if (!turnEl || seenEls.has(turnEl)) return;
                seenEls.add(turnEl);
                allTurns.push({ el: turnEl, role: 'assistant' });

                // Find the preceding user turn (sibling that does NOT contain .ds-markdown)
                let prev = turnEl.previousElementSibling;
                while (prev) {
                    if (!prev.querySelector('.ds-markdown') && !seenEls.has(prev)) {
                        const text = prev.innerText?.trim();
                        if (text && text.length > 1) {
                            seenEls.add(prev);
                            allTurns.push({ el: prev, role: 'user' });
                            break;
                        }
                    }
                    prev = prev.previousElementSibling;
                }
            });

            allTurns.sort((a, b) =>
                a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
            );

            allTurns.forEach(({ el, role }) => {
                let content;
                if (role === 'user') {
                    content = el.innerText?.trim();
                } else {
                    content = extractDeepSeekAnswer(el);
                }
                if (content) messages.push({ role, content });
            });

            if (messages.length > 0) return messages;
        }

        // ── Strategy 4: Role-based class containers (older DeepSeek layout)
        const chatMessages = document.querySelectorAll('[class*="chat-message"], [class*="ds-message"], [class*="msg-item"]');
        if (chatMessages.length > 0) {
            chatMessages.forEach(msg => {
                const cls = (msg.className || '') + ' ' + (msg.getAttribute('data-role') || '');
                let role = null;
                if (/\buser\b|human/i.test(cls)) role = 'user';
                else if (/\bassistant\b|\bbot\b/i.test(cls)) role = 'assistant';
                else if (msg.querySelector('.ds-markdown')) role = 'assistant';
                if (!role) return;
                let content;
                if (role === 'user') {
                    const inner = msg.querySelector('[class*="message-content"], [class*="msg-content"]') || msg;
                    content = inner.innerText?.trim();
                } else {
                    content = extractDeepSeekAnswer(msg);
                }
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        return extractGenericMessages();
    }

    function extractClaudeMessages() {
        const messages = [];

        // Strategy 1: data-testid based
        const userMsgs = document.querySelectorAll('[data-testid="user-message"], [class*="human-message"], [class*="user-message"]');
        const assistantMsgs = document.querySelectorAll('[data-testid="assistant-message"], [class*="assistant-message"], [class*="ai-message"]');

        if (userMsgs.length > 0 || assistantMsgs.length > 0) {
            // Collect all messages with positions for proper ordering
            const allMsgs = [];
            userMsgs.forEach(el => {
                const rect = el.getBoundingClientRect();
                allMsgs.push({ el, role: 'user', top: rect.top + window.scrollY });
            });
            assistantMsgs.forEach(el => {
                const rect = el.getBoundingClientRect();
                allMsgs.push({ el, role: 'assistant', top: rect.top + window.scrollY });
            });
            allMsgs.sort((a, b) => a.top - b.top);

            allMsgs.forEach(({ el, role }) => {
                const contentEl = el.querySelector('.font-claude-message, .markdown, [class*="message-content"]') || el;
                const content = role === 'user'
                    ? contentEl.innerText?.trim()
                    : extractRichContent(contentEl);
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 2: Conversation turns
        const turns = document.querySelectorAll('[class*="conversation-turn"], [class*="chat-message"]');
        turns.forEach(turn => {
            const cls = String(turn.className || '');
            let role = 'assistant';
            if (cls.includes('human') || cls.includes('user')) role = 'user';
            const content = role === 'user'
                ? turn.innerText?.trim()
                : extractRichContent(turn);
            if (content) messages.push({ role, content });
        });

        return messages.length > 0 ? messages : extractGenericMessages();
    }

    function extractGrokMessages() {
        const messages = [];

        // Grok messages in conversation container
        const msgElements = document.querySelectorAll('[class*="message"], [class*="chat-turn"]');
        msgElements.forEach(msg => {
            const cls = String(msg.className || '');
            if (cls.includes('system')) return;
            let role = 'assistant';
            if (cls.includes('user') || cls.includes('human')) role = 'user';
            const contentEl = msg.querySelector('.markdown, .markdown-body, [class*="message-content"]') || msg;
            const content = role === 'user'
                ? contentEl.innerText?.trim()
                : extractRichContent(contentEl);
            if (content) messages.push({ role, content });
        });

        return messages.length > 0 ? messages : extractGenericMessages();
    }

    function extractKimiMessages() {
        const messages = [];

        // Kimi message containers
        const msgElements = document.querySelectorAll('[class*="chat-message"], [class*="msg-"], [class*="message-item"]');
        msgElements.forEach(msg => {
            const cls = String(msg.className || '');
            const dataRole = msg.getAttribute('data-role') || '';
            let role = 'assistant';
            if (cls.includes('user') || dataRole === 'user') role = 'user';
            const contentEl = msg.querySelector('.markdown-body, .markdown, [class*="content"]') || msg;
            const content = role === 'user'
                ? contentEl.innerText?.trim()
                : extractRichContent(contentEl);
            if (content) messages.push({ role, content });
        });

        return messages.length > 0 ? messages : extractGenericMessages();
    }

    function extractPoeMessages() {
        const messages = [];

        // Poe DOM (observed Mar 2026):
        //
        //  div.ChatMessagesView_messageTuple__xxx   ← one per turn (user+bot pair)
        //    ├─ div.ChatMessage_chatMessage__xxx     ← user message
        //    │    └─ ...Message_messageTextContainer__xxx
        //    │         └─ div.Markdown_markdownContainer__xxx  (user text)
        //    └─ div.ChatMessage_chatMessage__xxx     ← bot response
        //         └─ ...Message_messageTextContainer__xxx
        //              └─ div.Markdown_markdownContainer__xxx  (bot text)
        //
        // Each tuple contains exactly 2 ChatMessage_chatMessage elements.
        // The first is the user (right-aligned), the second is the bot.

        // Strategy 1: Use message tuples for reliable user/bot pairing
        const tuples = document.querySelectorAll('[class*="messageTuple"], [class*="message_tuple"]');
        if (tuples.length > 0) {
            tuples.forEach(tuple => {
                const chatMsgs = tuple.querySelectorAll('[class*="chatMessage"]');
                chatMsgs.forEach((msg, idx) => {
                    const cls = String(msg.className || '');
                    const contentEl = msg.querySelector('[class*="Markdown_markdownContainer"], [class*="markdownContainer"], [class*="messageTextContainer"]') || msg;
                    // In a tuple, the first chatMessage is user, second is bot.
                    // Also check for rightSide class as a hint for user messages.
                    const isUser = idx === 0 || cls.includes('rightSide');
                    const role = isUser ? 'user' : 'assistant';
                    const content = role === 'user'
                        ? contentEl.innerText?.trim()
                        : extractRichContent(contentEl);
                    if (content) messages.push({ role, content });
                });
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 2: Direct chatMessage elements sorted by DOM order
        const chatMessages = document.querySelectorAll('[class*="chatMessage"]');
        if (chatMessages.length > 0) {
            chatMessages.forEach((msg, idx) => {
                const cls = String(msg.className || '');
                const contentEl = msg.querySelector('[class*="Markdown_markdownContainer"], [class*="markdownContainer"], [class*="messageTextContainer"]') || msg;
                const isUser = cls.includes('rightSide') || cls.includes('Right') || idx % 2 === 0;
                const role = isUser ? 'user' : 'assistant';
                const content = role === 'user'
                    ? contentEl.innerText?.trim()
                    : extractRichContent(contentEl);
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 3: Markdown containers paired with Message_row elements
        const messageRows = document.querySelectorAll('[class*="Message_row"]');
        if (messageRows.length > 0) {
            messageRows.forEach((row, idx) => {
                const cls = String(row.className || '');
                const contentEl = row.querySelector('[class*="markdownContainer"], [class*="messageText"]') || row;
                const isUser = cls.includes('rightSide') || cls.includes('Right') || cls.includes('human') || idx % 2 === 0;
                const role = isUser ? 'user' : 'assistant';
                const content = role === 'user'
                    ? contentEl.innerText?.trim()
                    : extractRichContent(contentEl);
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        return extractGenericMessages();
    }

    function extractDoubaoMessages() {
        const messages = [];

        // Doubao DOM (observed Mar 2026):
        //   div.message-block-container-xxx  ← one per turn
        //     User turn:  contains div.container-QQkdo4 (send bubble, user text)
        //     Bot turn:   contains div.container-P2rR72.flow-markdown-body (markdown)
        const blocks = document.querySelectorAll('[class*="message-block-container"]');
        if (blocks.length > 0) {
            blocks.forEach(block => {
                const sendEl = block.querySelector('[class*="container-QQkdo4"]');
                const mdEl = block.querySelector('[class*="flow-markdown-body"]');
                if (sendEl && !mdEl) {
                    const text = sendEl.innerText?.trim();
                    if (text) messages.push({ role: 'user', content: text });
                } else if (mdEl) {
                    const content = extractRichContent(mdEl);
                    if (content) messages.push({ role: 'assistant', content });
                }
            });
            if (messages.length > 0) return messages;
        }

        // Fallback: use send containers for user + paragraph elements for bot
        const sends = document.querySelectorAll('[class*="container-QQkdo4"]');
        if (sends.length > 0) {
            sends.forEach(el => {
                const text = el.innerText?.trim();
                if (text) messages.push({ role: 'user', content: text });
            });
        }

        return messages.length > 0 ? messages : extractGenericMessages();
    }

    function extractQianwenMessages() {
        const messages = [];

        // Qianwen DOM (observed Mar 2026):
        //   div.bubble-uo23is         ← user message text
        //   div.answerItem-SsrVa_     ← bot answer container
        //     div.answerMeta-xxx        ← metadata (model name, time) — skip
        //     div.markdown-pc-special-class / div.qk-markdown  ← answer content
        //
        // Bubbles and answerItems alternate in DOM order.

        const bubbles = Array.from(document.querySelectorAll('[class*="bubble-"]'));
        const answers = Array.from(document.querySelectorAll('[class*="answerItem-"]'));

        if (bubbles.length > 0 || answers.length > 0) {
            const all = [];
            bubbles.forEach(el => all.push({ el, role: 'user' }));
            answers.forEach(el => all.push({ el, role: 'assistant' }));
            all.sort((a, b) =>
                a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
            );

            all.forEach(({ el, role }) => {
                if (role === 'user') {
                    const text = el.innerText?.trim();
                    if (text) messages.push({ role: 'user', content: text });
                } else {
                    const mdEl = el.querySelector('.markdown-pc-special-class, .qk-markdown, [class*="markdown"]') || el;
                    const content = extractRichContent(mdEl);
                    if (content) messages.push({ role: 'assistant', content });
                }
            });
            if (messages.length > 0) return messages;
        }

        return extractGenericMessages();
    }

    // Generic fallback extractor for unsupported or changed layouts
    function extractGenericMessages() {
        const messages = [];

        // Try common chat message patterns
        const selectors = [
            '[role="log"] > div',
            '[class*="chat"] [class*="message"]',
            '[class*="conversation"] [class*="message"]',
            'main [class*="message"]',
            '[class*="thread"] > div > div'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length >= 2) {
                elements.forEach((el, index) => {
                    const cls = String(el.className || '');
                    const text = el.innerText?.trim();
                    if (!text || text.length < 2) return;
                    // Heuristic: even = user, odd = assistant
                    let role = index % 2 === 0 ? 'user' : 'assistant';
                    // Override if class hints are available
                    if (cls.includes('user') || cls.includes('human')) role = 'user';
                    if (cls.includes('assistant') || cls.includes('bot') || cls.includes('ai')) role = 'assistant';
                    const content = role === 'user' ? text : extractRichContent(el);
                    if (content) messages.push({ role, content });
                });
                if (messages.length >= 2) return messages;
                messages.length = 0;
            }
        }

        return messages;
    }

    function extractMessages() {
        const platform = detectPlatform();
        if (!platform) return extractGenericMessages();

        switch (platform.id) {
            case 'chatgpt': return extractChatGPTMessages();
            case 'gemini': return extractGeminiMessages();
            case 'deepseek': return extractDeepSeekMessages();
            case 'claude': return extractClaudeMessages();
            case 'grok': return extractGrokMessages();
            case 'kimi': return extractKimiMessages();
            case 'poe': return extractPoeMessages();
            case 'doubao': return extractDoubaoMessages();
            case 'qianwen': return extractQianwenMessages();
            default: return extractGenericMessages();
        }
    }

    // --- Export Formatting ---

    function formatAsMarkdown(messages, title) {
        const platform = detectPlatform();
        const lines = [
            `# ${title}`,
            ''
        ];
        messages.forEach(msg => {
            const roleLabel = msg.role === 'user' ? '## User' : '## Assistant';
            lines.push(roleLabel);
            lines.push('');
            lines.push(msg.content);
            lines.push('');
        });
        lines.push('---');
        lines.push(`*Exported by CopyTeX from ${platform?.name || 'AI Chat'} on ${new Date().toLocaleString()}*`);
        return lines.join('\n');
    }

    function formatAsJSON(messages, title) {
        const platform = detectPlatform();
        return JSON.stringify({
            title,
            platform: platform?.name || 'Unknown',
            url: window.location.href,
            exportedAt: new Date().toISOString(),
            messageCount: messages.length,
            messages: messages.map((msg, i) => ({
                index: i + 1,
                role: msg.role,
                content: msg.content
            }))
        }, null, 2);
    }

    // --- Download ---

    function sanitizeFilename(name) {
        return name
            .replace(/[\\/?%*:|"<>]/g, '-')
            .replace(/\s+/g, '_')
            .replace(/-{2,}/g, '-')
            .replace(/_{2,}/g, '_')
            .substring(0, 120)
            .trim();
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    function exportConversation(format = 'markdown') {
        const messages = extractMessages();
        if (messages.length === 0) {
            return { success: false, error: 'No messages found on this page. Please make sure a conversation is open.' };
        }

        const title = getConversationTitle();
        const safeName = sanitizeFilename(title);
        const platform = detectPlatform();
        const timestamp = new Date().toISOString().slice(0, 10);
        const results = [];

        if (format === 'markdown' || format === 'both') {
            const md = formatAsMarkdown(messages, title);
            const filename = `${timestamp}_${safeName}.md`;
            downloadFile(md, filename, 'text/markdown;charset=utf-8');
            results.push(filename);
        }
        if (format === 'json' || format === 'both') {
            const json = formatAsJSON(messages, title);
            const filename = `${timestamp}_${safeName}.json`;
            downloadFile(json, filename, 'application/json;charset=utf-8');
            results.push(filename);
        }

        return {
            success: true,
            messageCount: messages.length,
            platform: platform?.name || 'Unknown',
            title,
            files: results
        };
    }

    // --- Expose API for in-page export button (shared content-script context) ---
    window._copytexExporter = {
        detectPlatform,
        extractMessages,
        exportConversation,
        getConversationTitle,
        formatAsMarkdown,
        formatAsJSON,
        downloadFile,
        sanitizeFilename
    };

    // --- Message Listener (communication with popup) ---

    if (browserAPI?.runtime?.onMessage) {
        browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'detectExportPlatform') {
                const platform = detectPlatform();
                const messages = extractMessages();
                sendResponse({
                    platform: platform ? { id: platform.id, name: platform.name, icon: platform.icon } : null,
                    messageCount: messages.length,
                    title: getConversationTitle()
                });
                return true;
            }

            if (request.type === 'exportConversation') {
                const result = exportConversation(request.format || 'markdown');
                sendResponse(result);
                return true;
            }

            if (request.type === 'extractForExport') {
                // SPA pages load conversation content asynchronously.
                // Poll the DOM for messages before responding.
                const maxWait = 20000;
                const pollInterval = 1500;
                const startTime = Date.now();

                function tryExtract() {
                    const messages = extractMessages();
                    if (messages.length > 0 || Date.now() - startTime >= maxWait) {
                        let title = getConversationTitle();
                        const platform = detectPlatform();
                        const platformNames = ['Gemini Conversation', 'DeepSeek Conversation', 'ChatGPT Conversation', 'Claude Conversation', 'Grok Conversation', 'Kimi Conversation', 'Poe Conversation', 'Doubao Conversation', 'Qianwen Conversation', 'AI Conversation'];
                        if (request.sidebarTitle && (!title || platformNames.includes(title))) {
                            title = request.sidebarTitle;
                        }
                        const result = { title, messageCount: messages.length };
                        if (messages.length > 0) {
                            if (request.format === 'markdown' || request.format === 'both') {
                                result.markdown = formatAsMarkdown(messages, title);
                            }
                            if (request.format === 'json' || request.format === 'both') {
                                result.json = formatAsJSON(messages, title);
                            }
                        }
                        sendResponse(result);
                    } else {
                        setTimeout(tryExtract, pollInterval);
                    }
                }
                tryExtract();
                return true;
            }

            if (request.type === 'previewConversation') {
                const messages = extractMessages();
                const platform = detectPlatform();
                sendResponse({
                    platform: platform ? { id: platform.id, name: platform.name, icon: platform.icon } : null,
                    messageCount: messages.length,
                    title: getConversationTitle(),
                    preview: messages.slice(0, 5).map(m => ({
                        role: m.role,
                        content: m.content.substring(0, 150) + (m.content.length > 150 ? '...' : '')
                    }))
                });
                return true;
            }
        });
    }

})();
