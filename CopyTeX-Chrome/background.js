// CopyTeX - Background Script
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
const CHANGELOG_URL = 'https://heroblast10.github.io/CopyTeX/update.html';

// Installation / Update handler
browserAPI.runtime.onInstalled.addListener((details) => {
    console.log('CopyTeX extension event:', details.reason);

    // Set defaults (only if not already set)
    browserAPI.storage.local.get([
        'copytex_formula_enabled',
        'copytex_timeline_enabled',
        'copytex_prompts_enabled',
        'copytex_prompts'
    ], (result) => {
        const defaults = {};
        if (result.copytex_formula_enabled === undefined) defaults.copytex_formula_enabled = true;
        if (result.copytex_timeline_enabled === undefined) defaults.copytex_timeline_enabled = true;
        if (result.copytex_prompts_enabled === undefined) defaults.copytex_prompts_enabled = true;
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

// Helper: open a tab, wait for it to fully load, then send a message and get the response
function extractFromTab(url, format, timeoutMs) {
    return new Promise((resolve) => {
        const timeout = timeoutMs || 30000;
        let tabId = null;
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (tabId !== null) {
                try { browserAPI.tabs.remove(tabId); } catch (e) { /* ignore */ }
            }
            resolve(result);
        };

        // Timeout fallback
        const timer = setTimeout(() => finish({ title: url, messageCount: 0, error: 'Timeout' }), timeout);

        browserAPI.tabs.create({ url, active: false }, (tab) => {
            if (browserAPI.runtime.lastError || !tab) {
                clearTimeout(timer);
                finish({ title: url, messageCount: 0, error: 'Failed to open tab' });
                return;
            }
            tabId = tab.id;

            // Listen for tab to finish loading
            const onUpdated = (updatedTabId, changeInfo) => {
                if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
                browserAPI.tabs.onUpdated.removeListener(onUpdated);

                // Wait a bit for content scripts to initialize
                setTimeout(() => {
                    browserAPI.tabs.sendMessage(tabId, { type: 'extractForExport', format }, (response) => {
                        clearTimeout(timer);
                        if (browserAPI.runtime.lastError || !response) {
                            // Retry once after another short delay
                            setTimeout(() => {
                                browserAPI.tabs.sendMessage(tabId, { type: 'extractForExport', format }, (resp2) => {
                                    if (browserAPI.runtime.lastError || !resp2) {
                                        finish({ title: url, messageCount: 0, error: 'No response from tab' });
                                    } else {
                                        finish(resp2);
                                    }
                                });
                            }, 2000);
                        } else {
                            finish(response);
                        }
                    });
                }, 3000);
            };
            browserAPI.tabs.onUpdated.addListener(onUpdated);
        });
    });
}

// Cross-browser message handling
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'checkClipboardPermission') {
        // Check if permissions API is available
        if (browserAPI.permissions && browserAPI.permissions.contains) {
            browserAPI.permissions.contains({
                permissions: ['clipboardWrite']
            }, (result) => {
                sendResponse({hasPermission: result});
            });
        } else {
            // Assume permission is available for browsers without permissions API
            sendResponse({hasPermission: true});
        }
        return true; // Keep message channel open
    }

    if (request.type === 'exportAllChats') {
        // Orchestrate: open each conversation URL in a background tab, extract, report progress
        const conversations = request.conversations || [];
        const format = request.format || 'markdown';
        const senderTabId = sender.tab ? sender.tab.id : null;

        (async () => {
            const results = [];
            for (let i = 0; i < conversations.length; i++) {
                const convo = conversations[i];
                // Send progress update to the requesting tab
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

                const result = await extractFromTab(convo.url, format, 35000);
                result.originalTitle = convo.title;
                result.url = convo.url;
                results.push(result);

                // Send progress update: done with this one
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

            // Send final results
            if (senderTabId !== null) {
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
        // Fallback clipboard copy through background script
        if (browserAPI.scripting && browserAPI.scripting.executeScript) {
            // Manifest V3 (Chrome, Edge)
            browserAPI.scripting.executeScript({
                target: { tabId: sender.tab.id },
                func: (text) => {
                    navigator.clipboard.writeText(text).catch(() => {
                        // Fallback method
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
            // Manifest V2 (Firefox, older browsers)
            browserAPI.tabs.executeScript(sender.tab.id, {
                code: `
                    (function(text) {
                        navigator.clipboard.writeText(text).catch(() => {
                            const textarea = document.createElement('textarea');
                            textarea.value = text;
                            document.body.appendChild(textarea);
                            textarea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textarea);
                        });
                    })('${request.text.replace(/'/g, "\\'")}');
                `
            });
        }
        sendResponse({success: true});
        return true;
    }
});
