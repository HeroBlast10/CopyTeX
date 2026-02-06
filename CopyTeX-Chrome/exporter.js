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
        // Clean up platform-specific suffixes
        title = title
            .replace(/\s*[-–|·]\s*(ChatGPT|Google Gemini|Gemini|DeepSeek|DeepSeek Chat|Claude|Grok|Kimi|Poe).*$/i, '')
            .replace(/^(ChatGPT|Google Gemini|Gemini|DeepSeek|Claude|Grok|Kimi|Poe)\s*[-–|·]\s*/i, '')
            .trim();
        const platform = detectPlatform();
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

        // Strategy 1: query-content and model-response pairs in turns
        const turns = document.querySelectorAll('.conversation-turn, [class*="turn-content"], [class*="conversation-container"] > div');
        if (turns.length > 0) {
            turns.forEach(turn => {
                const queryEl = turn.querySelector('.query-text, .query-content, [class*="query"]');
                const responseEl = turn.querySelector('.model-response-text, .response-content, [class*="model-response"], .markdown-main-panel');
                if (queryEl) {
                    const content = queryEl.innerText?.trim();
                    if (content) messages.push({ role: 'user', content });
                }
                if (responseEl) {
                    const content = extractRichContent(responseEl);
                    if (content) messages.push({ role: 'assistant', content });
                }
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 2: message-content custom elements
        const messageContents = document.querySelectorAll('message-content');
        if (messageContents.length > 0) {
            messageContents.forEach((mc, index) => {
                const isUser = index % 2 === 0;
                const content = isUser
                    ? mc.innerText?.trim()
                    : extractRichContent(mc);
                if (content) messages.push({ role: isUser ? 'user' : 'assistant', content });
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 3: Look for user-query and model-response elements
        const userQueries = document.querySelectorAll('user-query, .user-query');
        const modelResponses = document.querySelectorAll('model-response, .model-response');
        if (userQueries.length > 0 || modelResponses.length > 0) {
            const maxLen = Math.max(userQueries.length, modelResponses.length);
            for (let i = 0; i < maxLen; i++) {
                if (i < userQueries.length) {
                    const content = userQueries[i].innerText?.trim();
                    if (content) messages.push({ role: 'user', content });
                }
                if (i < modelResponses.length) {
                    const content = extractRichContent(modelResponses[i]);
                    if (content) messages.push({ role: 'assistant', content });
                }
            }
            if (messages.length > 0) return messages;
        }

        // Strategy 4: Generic turn detection via alternating blocks
        return extractGenericMessages();
    }

    function extractDeepSeekMessages() {
        const messages = [];

        // Strategy 1: Role-based containers
        const chatMessages = document.querySelectorAll('[class*="chat-message"], [class*="ds-message"], [class*="msg-item"]');
        if (chatMessages.length > 0) {
            chatMessages.forEach(msg => {
                const classList = msg.className || '';
                const dataRole = msg.getAttribute('data-role') || '';
                let role = 'assistant';
                if (classList.includes('user') || dataRole === 'user') role = 'user';
                else if (classList.includes('assistant') || classList.includes('bot') || dataRole === 'assistant') role = 'assistant';

                const contentEl = msg.querySelector('.ds-markdown, .markdown-body, .markdown, [class*="message-content"], [class*="msg-content"]')
                    || msg;
                const content = role === 'user'
                    ? contentEl.innerText?.trim()
                    : extractRichContent(contentEl);
                if (content) messages.push({ role, content });
            });
            if (messages.length > 0) return messages;
        }

        // Strategy 2: Alternating message blocks in chat container
        const chatContainer = document.querySelector('[class*="chat-container"], [class*="conversation"], main');
        if (chatContainer) {
            const blocks = chatContainer.querySelectorAll('[class*="message"]');
            blocks.forEach(block => {
                const classList = block.className || '';
                if (classList.includes('system') || classList.includes('divider')) return;
                let role = 'assistant';
                if (classList.includes('user') || classList.includes('human')) role = 'user';
                const contentEl = block.querySelector('.ds-markdown, .markdown-body, .markdown') || block;
                const content = role === 'user'
                    ? contentEl.innerText?.trim()
                    : extractRichContent(contentEl);
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
            const classList = turn.className || '';
            let role = 'assistant';
            if (classList.includes('human') || classList.includes('user')) role = 'user';
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
            const classList = msg.className || '';
            if (classList.includes('system')) return;
            let role = 'assistant';
            if (classList.includes('user') || classList.includes('human')) role = 'user';
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
            const classList = msg.className || '';
            const dataRole = msg.getAttribute('data-role') || '';
            let role = 'assistant';
            if (classList.includes('user') || dataRole === 'user') role = 'user';
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

        // Poe message containers
        const msgElements = document.querySelectorAll('[class*="Message"], [class*="chatMessage"], [class*="message_row"]');
        msgElements.forEach(msg => {
            const classList = msg.className || '';
            let role = 'assistant';
            if (classList.includes('human') || classList.includes('Human') || classList.includes('user') || classList.includes('User')) {
                role = 'user';
            }
            if (classList.includes('bot') || classList.includes('Bot') || classList.includes('assistant')) {
                role = 'assistant';
            }
            const contentEl = msg.querySelector('.Markdown, .markdown, .markdown_body, [class*="message_content"]') || msg;
            const content = role === 'user'
                ? contentEl.innerText?.trim()
                : extractRichContent(contentEl);
            if (content) messages.push({ role, content });
        });

        return messages.length > 0 ? messages : extractGenericMessages();
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
                    const classList = el.className || '';
                    const text = el.innerText?.trim();
                    if (!text || text.length < 2) return;
                    // Heuristic: even = user, odd = assistant
                    let role = index % 2 === 0 ? 'user' : 'assistant';
                    // Override if class hints are available
                    if (classList.includes('user') || classList.includes('human')) role = 'user';
                    if (classList.includes('assistant') || classList.includes('bot') || classList.includes('ai')) role = 'assistant';
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
            const filename = `${safeName}_${timestamp}.md`;
            downloadFile(md, filename, 'text/markdown;charset=utf-8');
            results.push(filename);
        }
        if (format === 'json' || format === 'both') {
            const json = formatAsJSON(messages, title);
            const filename = `${safeName}_${timestamp}.json`;
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
                        const title = getConversationTitle();
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
