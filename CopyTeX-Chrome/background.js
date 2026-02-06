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

// Installation handler — set default settings
browserAPI.runtime.onInstalled.addListener(() => {
    console.log('CopyTeX extension installed');
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
});

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
