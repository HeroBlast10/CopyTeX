// CopyTeX - Content Script
// Simplified direct LaTeX extraction with focus on original sources

const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) {
        console.log('[UMFC]', ...args);
    }
};

// Cross-browser API compatibility
const browserAPI = (() => {
    if (typeof browser !== 'undefined') {
        return browser; // Firefox, Safari
    }
    if (typeof chrome !== 'undefined') {
        return chrome; // Chrome, Edge
    }
    return null;
})();

// Platform specific configuration
const PLATFORM_CONFIGS = [
    {
        id: 'gemini',
        hostIncludes: ['gemini.google.com'],
        selectors: [
            '.math-inline',
            '.math-block',
            '.math-display',
            '.katex',
            '.katex-html',
            '.katex-display',
            '.katex-mathml',
            '[data-math]',
            '[data-latex]',
            '[data-tex]',
            '[data-katex]'
        ]
    },
    {
        id: 'chatgpt',
        hostIncludes: ['chat.openai.com', 'chatgpt.com'],
        selectors: [
            '.katex',
            '.katex-html',
            '.katex-display',
            '.katex-mathml',
            '.MathJax',
            '.mjx-container',
            '.mjx-chtml',
            'math',
            '[data-latex]',
            '[data-math]'
        ]
    },
    {
        id: 'deepseek',
        hostIncludes: ['chat.deepseek.com'],
        selectors: [
            '.katex',
            '.ds-math',
            '.formula-box',
            '.katex-html',
            '.katex-display',
            '[data-katex]',
            '[data-latex]'
        ]
    },
    {
        id: 'claude',
        hostIncludes: ['claude.ai'],
        selectors: [
            '.katex',
            '.katex-html',
            '.katex-display',
            '.math-display',
            '.inline-math',
            'math',
            '[data-math-content]',
            '[data-latex]'
        ]
    },
    {
        id: 'kimi',
        hostIncludes: ['kimi.ai', 'kimi.moonshot.cn'],
        selectors: [
            '.katex',
            '.katex-html',
            '.katex-display',
            '[data-latex]',
            '[data-math]',
            '[data-tex]'
        ]
    },
    {
        id: 'grok',
        hostIncludes: ['grok.com', 'www.grok.com'],
        selectors: [
            '.katex',
            '.katex-display',
            '.katex-html',
            '.katex-mathml',
            'math',
            '[data-math]',
            '[data-latex]'
        ]
    },
    {
        id: 'poe',
        hostIncludes: ['poe.com', 'www.poe.com'],
        selectors: [
            '.katex',
            '.katex-html',
            '.katex-display',
            '.katex-mathml',
            'math',
            '[data-math]',
            '[data-latex]'
        ]
    }
];

const DATA_ATTRIBUTE_PREFERENCES = [
    'data-math',
    'data-latex',
    'data-tex',
    'data-katex',
    'data-expr',
    'data-expression',
    'data-original',
    'data-source',
    'data-formula',
    'data-mathml',
    'data-original-latex',
    'data-math-content'
];

function getPlatformConfig(hostname) {
    return PLATFORM_CONFIGS.find(config =>
        config.hostIncludes.some(fragment => hostname.includes(fragment))
    ) || null;
}

// Shadow DOM aware selector utility
function queryShadowRoot(root, selector) {
    const results = [];
    if (!(root instanceof Element) && root !== document && root !== document.body) {
        return results;
    }

    if (root.querySelectorAll) {
        results.push(...root.querySelectorAll(selector));
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
    let current = walker.currentNode || walker.root;

    while (current) {
        if (current.shadowRoot) {
            results.push(...current.shadowRoot.querySelectorAll(selector));
            results.push(...queryShadowRoot(current.shadowRoot, selector));
        }
        current = walker.nextNode();
    }

    return results;
}

function normalizeMathElement(element) {
    if (!(element instanceof Element)) {
        return null;
    }

    if (element.matches('annotation')) {
        const mathContainer = element.closest('.katex, .math-inline, .math-block, .math-display');
        if (mathContainer) {
            return mathContainer;
        }
    }

    const katexRoot = element.closest('.katex');
    if (katexRoot) {
        return katexRoot;
    }

    const mathContainer = element.closest('.math-inline, .math-block, .math-display');
    if (mathContainer) {
        return mathContainer;
    }

    return element;
}

function getClosestAttributeValue(element, attribute) {
    if (!(element instanceof Element)) {
        return null;
    }
    const closestWithAttribute = element.closest(`[${attribute}]`);
    if (closestWithAttribute) {
        const value = closestWithAttribute.getAttribute(attribute);
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return null;
}

function getLatexFromDataAttributes(element) {
    for (const attribute of DATA_ATTRIBUTE_PREFERENCES) {
        const value = getClosestAttributeValue(element, attribute);
        if (value) {
            return value;
        }
    }
    return null;
}

function getKatexAnnotationLatex(element) {
    if (!(element instanceof Element)) {
        return null;
    }

    const container = element.closest('.katex, .math-inline, .math-block, .math-display');
    if (!container) {
        return null;
    }

    const annotation = container.querySelector('annotation[encoding*="tex"], annotation[encoding*="TeX"], annotation');
    if (annotation && annotation.textContent && annotation.textContent.trim()) {
        return annotation.textContent.trim();
    }

    const mathmlAnnotation = container.querySelector('.katex-mathml annotation[encoding*="tex"], .katex-mathml annotation[encoding*="TeX"]');
    if (mathmlAnnotation && mathmlAnnotation.textContent && mathmlAnnotation.textContent.trim()) {
        return mathmlAnnotation.textContent.trim();
    }

    const script = container.querySelector('script[type*="math/tex"], script[type*="math/mml"]');
    if (script && script.textContent && script.textContent.trim()) {
        return script.textContent.trim();
    }

    return null;
}

function getMathJaxLatex(element) {
    if (!(element instanceof Element)) {
        return null;
    }

    const container = element.closest('.MathJax, .mjx-container, .mjx-chtml, math');
    if (!container) {
        return null;
    }

    const script = container.querySelector('script[type*="math/tex"], script[type*="math/asciimath"]');
    if (script && script.textContent && script.textContent.trim()) {
        return script.textContent.trim();
    }

    if (container.tagName === 'MATH' && container.textContent && container.textContent.trim()) {
        return container.textContent.trim();
    }

    return null;
}

function extractGeminiLatex(element) {
    if (!(element instanceof Element)) {
        return null;
    }

    const container = element.closest('[data-math], .math-inline, .math-block, .katex, .katex-html');
    if (!container) {
        return null;
    }

    for (const attribute of ['data-math', 'data-latex', 'data-tex', 'data-katex', 'data-original']) {
        if (container.hasAttribute(attribute)) {
            const value = container.getAttribute(attribute);
            if (value && value.trim()) {
                return value.trim();
            }
        }
    }

    const annotation = container.querySelector('annotation[encoding*="tex"], annotation[encoding*="TeX"]');
    if (annotation && annotation.textContent && annotation.textContent.trim()) {
        return annotation.textContent.trim();
    }

    const script = container.querySelector('script[type*="math/tex"]');
    if (script && script.textContent && script.textContent.trim()) {
        return script.textContent.trim();
    }

    return null;
}

function extractPlatformSpecificLatex(element) {
    const hostname = window.location.hostname;

    if (hostname.includes('gemini.google.com')) {
        const dataSource = extractGeminiLatex(element);
        if (dataSource) {
            return dataSource;
        }
    }

    if (hostname.includes('claude.ai')) {
        const claudeData = getClosestAttributeValue(element, 'data-math-content');
        if (claudeData) {
            return claudeData;
        }
    }

    if (hostname.includes('chat.deepseek.com')) {
        const deepseekData = getClosestAttributeValue(element, 'data-katex') ||
            getClosestAttributeValue(element, 'data-formula');
        if (deepseekData) {
            return deepseekData;
        }
    }

    return null;
}

function getImageAltLatex(element) {
    if (!(element instanceof Element)) {
        return null;
    }

    const image = element.tagName === 'IMG' ? element : element.closest('img');
    if (image && image.alt && image.alt.trim()) {
        return image.alt.trim();
    }

    return null;
}

function getTextFallbackLatex(element) {
    if (!(element instanceof Element)) {
        return null;
    }

    const text = element.textContent ? element.textContent.trim() : '';
    if (!text) {
        return null;
    }

    if (text.includes('\\')) {
        return text;
    }

    const containsMathSymbols = /[∑∏∫√∞≈≠≤≥±•α-ωΑ-Ω]/.test(text);
    if (containsMathSymbols && text.includes('=')) {
        return text;
    }

    return null;
}

function cleanLatexOutput(latex) {
    if (!latex) {
        return null;
    }

    let cleaned = latex;
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
    cleaned = cleaned.replace(/\r\n|\r/g, '\n');
    cleaned = cleaned.replace(/\t/g, ' ');
    cleaned = cleaned.replace(/\u00A0/g, ' ');
    cleaned = cleaned.replace(/[ ]{2,}/g, ' ');
    cleaned = cleaned.replace(/\s+\n/g, '\n');
    cleaned = cleaned.replace(/\n\s+/g, '\n');
    cleaned = cleaned.trim();

    return cleaned;
}

function extractLatexFromElement(element) {
    if (!element) {
        return null;
    }

    const sources = [
        getLatexFromDataAttributes(element),
        getKatexAnnotationLatex(element),
        getMathJaxLatex(element),
        extractPlatformSpecificLatex(element),
        getImageAltLatex(element),
        getTextFallbackLatex(element)
    ];

    for (const source of sources) {
        if (source) {
            const cleaned = cleanLatexOutput(source);
            if (cleaned) {
                return cleaned;
            }
        }
    }

    return null;
}

async function copyToClipboard(text, element) {
    const preview = text.length > 80 ? `${text.substring(0, 80)}...` : text;

    try {
        await navigator.clipboard.writeText(text);
        showCopyMessage(`Copied: ${preview}`, true);
    } catch (error) {
        debugLog('Clipboard API failed, trying fallback', error);

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showCopyMessage(`Copied: ${preview}`, true);
        } catch (fallbackError) {
            debugLog('Fallback clipboard method failed', fallbackError);
            showCopyMessage('Copy failed', false);

            if (browserAPI && browserAPI.runtime) {
                browserAPI.runtime.sendMessage({
                    type: 'copyToClipboard',
                    text
                });
            }
        }
    }
}

let copyMessageElement = null;

function showCopyMessage(message, isSuccess) {
    if (!copyMessageElement) {
        copyMessageElement = document.createElement('div');
        copyMessageElement.className = 'umfc-copy-toast';
        copyMessageElement.style.position = 'fixed';
        copyMessageElement.style.top = '24px';
        copyMessageElement.style.left = '50%';
        copyMessageElement.style.transform = 'translateX(-50%)';
        copyMessageElement.style.padding = '14px 22px';
        copyMessageElement.style.zIndex = '2147483647';
        copyMessageElement.style.borderRadius = '12px';
        copyMessageElement.style.backdropFilter = 'blur(14px)';
        copyMessageElement.style.border = '1px solid rgba(255, 255, 255, 0.08)';
        copyMessageElement.style.boxShadow = '0 12px 32px rgba(9, 17, 34, 0.45)';
        copyMessageElement.style.fontSize = '14px';
        copyMessageElement.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        copyMessageElement.style.fontWeight = '500';
        copyMessageElement.style.letterSpacing = '0.4px';
        copyMessageElement.style.maxWidth = '420px';
        copyMessageElement.style.wordBreak = 'break-word';
        copyMessageElement.style.textAlign = 'center';
        copyMessageElement.style.transition = 'all 0.3s ease';
        copyMessageElement.style.opacity = '0';
        copyMessageElement.style.transform = 'translateX(-50%) translateY(-12px) scale(0.95)';
        document.body.appendChild(copyMessageElement);
    }

    copyMessageElement.textContent = message;

    if (isSuccess) {
        copyMessageElement.style.background = 'linear-gradient(140deg, rgba(10, 36, 99, 0.88), rgba(12, 88, 138, 0.9))';
        copyMessageElement.style.color = '#D8F2FF';
        copyMessageElement.style.borderColor = 'rgba(56, 189, 248, 0.55)';
        copyMessageElement.style.boxShadow = '0 16px 38px rgba(15, 118, 230, 0.35), 0 0 20px rgba(34, 211, 238, 0.35)';
        copyMessageElement.style.textShadow = '0 0 6px rgba(56, 189, 248, 0.45)';
    } else {
        copyMessageElement.style.background = 'linear-gradient(140deg, rgba(78, 16, 32, 0.9), rgba(120, 16, 48, 0.9))';
        copyMessageElement.style.color = '#FFE2EC';
        copyMessageElement.style.borderColor = 'rgba(248, 113, 113, 0.55)';
        copyMessageElement.style.boxShadow = '0 16px 36px rgba(185, 28, 28, 0.35), 0 0 18px rgba(248, 113, 113, 0.35)';
        copyMessageElement.style.textShadow = '0 0 5px rgba(248, 113, 113, 0.4)';
    }

    copyMessageElement.style.display = 'block';
    requestAnimationFrame(() => {
        copyMessageElement.style.opacity = '1';
        copyMessageElement.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    });

    if (copyMessageElement.hideTimeout) {
        clearTimeout(copyMessageElement.hideTimeout);
    }

    copyMessageElement.hideTimeout = setTimeout(() => {
        if (!copyMessageElement) {
            return;
        }

        copyMessageElement.style.opacity = '0';
        copyMessageElement.style.transform = 'translateX(-50%) translateY(-12px) scale(0.95)';

        setTimeout(() => {
            if (copyMessageElement) {
                copyMessageElement.style.display = 'none';
            }
        }, 250);
    }, 2400);
}

function addDoubleClickHandler(element) {
    if (!(element instanceof Element)) {
        return;
    }

    if (element.dataset.umfcListenerAttached === 'true') {
        return;
    }

    element.dataset.umfcListenerAttached = 'true';
    element.classList.add('umfc-math-target');
    element.style.cursor = 'copy';

    element.addEventListener('dblclick', event => {
        const targets = [];
        if (event.target instanceof Element) {
            targets.push(event.target);
            const closest = event.target.closest('.katex, .math-inline, .math-block, .math-display');
            if (closest && closest !== event.currentTarget) {
                targets.push(closest);
            }
        }
        targets.push(element);

        let latex = null;
        for (const target of targets) {
            latex = extractLatexFromElement(target);
            if (latex) {
                break;
            }
        }

        if (latex) {
            copyToClipboard(latex, element);
        } else {
            showCopyMessage('未找到LaTeX源码 / No LaTeX source found', false);
            debugLog('No LaTeX source found for element', element);
        }
    });
}

function addCopyFunctionalityToMath() {
    const hostname = window.location.hostname;
    const platformConfig = getPlatformConfig(hostname);

    if (!platformConfig) {
        debugLog('Platform not supported, skipping initialization', hostname);
        return;
    }

    if (platformConfig.id) {
        document.body.setAttribute('data-platform', platformConfig.id);
    }

    if (!platformConfig.selectors.length) {
        return;
    }

    const selector = platformConfig.selectors.join(', ');
    let rawElements = [];

    try {
        rawElements = queryShadowRoot(document.body, selector);
    } catch (error) {
        debugLog('Selector evaluation failed', error);
        rawElements = [];
    }

    if (!rawElements.length) {
        return;
    }

    rawElements.forEach(rawElement => {
        const mathElement = normalizeMathElement(rawElement);
        if (!mathElement) {
            return;
        }

        if (mathElement.dataset.umfcProcessed === 'true') {
            return;
        }

        mathElement.dataset.umfcProcessed = 'true';
        addDoubleClickHandler(mathElement);
    });
}

const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
};

const optimizedObserverCallback = debounce(mutations => {
    const hasNewNodes = mutations.some(mutation => mutation.addedNodes && mutation.addedNodes.length > 0);
    if (hasNewNodes) {
        addCopyFunctionalityToMath();
    }
}, 250);

function initObserver() {
    if (!document.body) {
        return;
    }

    const observer = new MutationObserver(optimizedObserverCallback);
    observer.observe(document.body, {
        subtree: true,
        childList: true
    });
}

function initialize() {
    if (!document.body) {
        return;
    }

    if (document.documentElement.dataset.umfcInitialized === 'true') {
        return;
    }

    document.documentElement.dataset.umfcInitialized = 'true';

    addCopyFunctionalityToMath();
    initObserver();

    setTimeout(addCopyFunctionalityToMath, 1500);
    setTimeout(addCopyFunctionalityToMath, 4000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
    initialize();
}
