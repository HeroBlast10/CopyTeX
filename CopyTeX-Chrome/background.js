// AI Chat Toolkit - Background Script
// Cross-browser compatible (Chrome, Firefox, Edge, Safari)

// Cross-browser API compatibility
const browserAPI = (() => {
    if (typeof browser !== 'undefined') {
        return browser; // Firefox, Safari
    } else if (typeof chrome !== 'undefined') {
        return chrome; // Chrome, Edge
    }
    return null;
})();

// Changelog URL (GitHub Pages)
const CHANGELOG_URL = 'https://heroblast10.github.io/AI%20Chat%20Toolkit/update.html';

// Installation / Update handler
browserAPI.runtime.onInstalled.addListener((details) => {
    console.log('AI Chat Toolkit extension event:', details.reason);

    // Set defaults (only if not already set)
    browserAPI.storage.local.get([
        'copytex_formula_enabled',
        'copytex_timeline_enabled',
        'copytex_prompts_enabled',
        'copytex_export_enabled',
        'copytex_watermark_enabled',
        'copytex_prompts'
    ], (result) => {
        const defaults = {};
        if (result.copytex_formula_enabled === undefined) defaults.copytex_formula_enabled = true;
        if (result.copytex_timeline_enabled === undefined) defaults.copytex_timeline_enabled = true;
        if (result.copytex_prompts_enabled === undefined) defaults.copytex_prompts_enabled = true;
        if (result.copytex_export_enabled === undefined) defaults.copytex_export_enabled = true;
        if (result.copytex_watermark_enabled === undefined) defaults.copytex_watermark_enabled = true;
        if (result.copytex_prompts === undefined) defaults.copytex_prompts = [];
        if (Object.keys(defaults).length > 0) {
            browserAPI.storage.local.set(defaults);
        }
    });

    // Open changelog on update (not on first install)
    if (details.reason === 'update') {
        const currentVersion = browserAPI.runtime.getManifest().version;
        const previousVersion = details.previousVersion;
        // Only open if version actually changed
        if (currentVersion !== previousVersion) {
            browserAPI.tabs.create({
                url: CHANGELOG_URL + '?v=' + currentVersion + '&from=' + (previousVersion || ''),
                active: true
            });
        }
    }
});

// Helper: fetch an image URL and return it as a data URL (for content scripts that can't fetch cross-origin)
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'fetchImageAsDataUrl') {
        fetch(request.url)
            .then(response => {
                if (!response.ok) throw new Error('Fetch failed: ' + response.status);
                return response.blob();
            })
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => sendResponse({ dataUrl: reader.result });
                reader.onerror = () => sendResponse({ error: 'FileReader failed' });
                reader.readAsDataURL(blob);
            })
            .catch(err => sendResponse({ error: err.message }));
        return true; // keep channel open for async sendResponse
    }
});

// Helper: open a tab, wait for it to fully load, then send a message and get the response.
function extractFromTab(url, format, timeoutMs, sidebarTitle) {
    return new Promise((resolve) => {
        const timeout = timeoutMs || 60000;
        let tabId = null;
        let settled = false;
        let onUpdated = null;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (onUpdated) {
                browserAPI.tabs.onUpdated.removeListener(onUpdated);
                onUpdated = null;
            }
            if (tabId !== null) {
                try { browserAPI.tabs.remove(tabId); } catch (e) { /* ignore */ }
            }
            resolve(result);
        };

        const timer = setTimeout(() => finish({ title: url, messageCount: 0, error: 'Timeout' }), timeout);

        browserAPI.tabs.create({ url, active: false }, (tab) => {
            if (browserAPI.runtime.lastError || !tab) {
                finish({ title: url, messageCount: 0, error: 'Failed to open tab' });
                return;
            }
            tabId = tab.id;

            onUpdated = (updatedTabId, changeInfo) => {
                if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
                browserAPI.tabs.onUpdated.removeListener(onUpdated);
                onUpdated = null;

                let attempt = 0;
                const maxAttempts = 8;
                const retryDelay = 2500;

                function trySendMessage() {
                    attempt++;
                    if (settled) return;
                    browserAPI.tabs.sendMessage(tabId, { type: 'extractForExport', format, sidebarTitle }, (response) => {
                        if (settled) return;
                        if (browserAPI.runtime.lastError || !response) {
                            if (attempt < maxAttempts) {
                                setTimeout(trySendMessage, retryDelay);
                            } else {
                                finish({ title: url, messageCount: 0, error: 'Content script not responding' });
                            }
                        } else {
                            if (response.messageCount === 0 && attempt < maxAttempts) {
                                setTimeout(trySendMessage, retryDelay);
                            } else {
                                finish(response);
                            }
                        }
                    });
                }

                setTimeout(trySendMessage, 4000);
            };
            browserAPI.tabs.onUpdated.addListener(onUpdated);
        });
    });
}

// Batch export cancellation flag
let _batchExportCancelled = false;

// Cross-browser message handling
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'checkClipboardPermission') {
        if (browserAPI.permissions && browserAPI.permissions.contains) {
            browserAPI.permissions.contains({
                permissions: ['clipboardWrite']
            }, (result) => {
                sendResponse({hasPermission: result});
            });
        } else {
            sendResponse({hasPermission: true});
        }
        return true;
    }

    if (request.type === 'cancelExportAllChats') {
        _batchExportCancelled = true;
        sendResponse({ cancelled: true });
        return true;
    }

    if (request.type === 'exportAllChats') {
        const conversations = request.conversations || [];
        const format = request.format || 'markdown';
        const senderTabId = sender.tab ? sender.tab.id : null;
        _batchExportCancelled = false;

        // Keep service worker alive during long-running batch export (MV3)
        let keepAlive = setInterval(() => {
            if (browserAPI.runtime?.getPlatformInfo) {
                browserAPI.runtime.getPlatformInfo(() => {});
            }
        }, 25000);

        (async () => {
            const results = [];
            for (let i = 0; i < conversations.length; i++) {
                if (_batchExportCancelled) break;

                const convo = conversations[i];
                if (senderTabId !== null) {
                    try {
                        browserAPI.tabs.sendMessage(senderTabId, {
                            type: 'exportAllChatsProgress',
                            current: i + 1,
                            total: conversations.length,
                            title: convo.title,
                            status: 'extracting'
                        });
                    } catch (e) { /* ignore */ }
                }

                const result = await extractFromTab(convo.url, format, 45000, convo.title);
                result.originalTitle = convo.title;
                result.url = convo.url;
                results.push(result);

                if (_batchExportCancelled) break;

                if (senderTabId !== null) {
                    try {
                        browserAPI.tabs.sendMessage(senderTabId, {
                            type: 'exportAllChatsProgress',
                            current: i + 1,
                            total: conversations.length,
                            title: convo.title,
                            status: result.messageCount > 0 ? 'done' : 'skipped',
                            messageCount: result.messageCount || 0
                        });
                    } catch (e) { /* ignore */ }
                }
            }

            clearInterval(keepAlive);

            if (senderTabId !== null && !_batchExportCancelled) {
                try {
                    browserAPI.tabs.sendMessage(senderTabId, {
                        type: 'exportAllChatsComplete',
                        results
                    });
                } catch (e) { /* ignore */ }
            }
        })();

        sendResponse({ started: true, total: conversations.length });
        return true;
    }

    if (request.type === 'copyToClipboard') {
        if (!sender.tab || !sender.tab.id) {
            sendResponse({ success: false, error: 'No tab context' });
            return true;
        }
        if (browserAPI.scripting && browserAPI.scripting.executeScript) {
            browserAPI.scripting.executeScript({
                target: { tabId: sender.tab.id },
                func: (text) => {
                    navigator.clipboard.writeText(text).catch(() => {
                        const textarea = document.createElement('textarea');
                        textarea.value = text;
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                    });
                },
                args: [request.text]
            });
        } else if (browserAPI.tabs && browserAPI.tabs.executeScript) {
            const escaped = JSON.stringify(request.text);
            browserAPI.tabs.executeScript(sender.tab.id, {
                code: `(function(){var text=${escaped};navigator.clipboard.writeText(text).catch(function(){var t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);});})()`
            });
        }
        sendResponse({success: true});
        return true;
    }
});
