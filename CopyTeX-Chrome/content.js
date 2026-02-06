// CopyTeX - Content Script
// Universal formula detection by rendering engine — works on ANY website
// Supports: KaTeX, MathJax, MediaWiki Math, and data-attribute formulas

const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) {
        console.log('[CopyTeX]', ...args);
    }
};

// Cross-browser API compatibility
const browserAPI = (() => {
    if (typeof browser !== 'undefined') return browser;
    if (typeof chrome !== 'undefined') return chrome;
    return null;
})();

// ============================================================
//  Universal formula selectors — rendering-engine based
//  NOT hostname based. Works on ANY site using these renderers.
// ============================================================
const FORMULA_SELECTORS = [
    '.katex',                       // KaTeX (ChatGPT, Gemini, DeepSeek, Grok, etc.)
    '.katex-display',               // KaTeX display mode
    '.MathJax',                     // MathJax v2
    '.MathJax_SVG',                 // MathJax v2 SVG
    '.MathJax_Display',             // MathJax v2 display
    '.mjx-container',               // MathJax v3
    '.mjx-chtml',                   // MathJax v3 CHTML
    '.mwe-math-element',            // MediaWiki (Wikipedia)
    '.math-inline',                 // Various (Doubao, Gemini, etc.)
    '.math-block',                  // Various block formulas
    '.math-display',                // Various display formulas
    '.ds-math',                     // DeepSeek specific
    '.formula-box',                 // Generic formula containers
    '[data-custom-copy-text]',      // Doubao-style
].join(', ');

// ============================================================
//  LaTeX Extractor — priority-based extraction pipeline
//  Inspired by AITimeline's LatexExtractor approach
// ============================================================
function extractLatex(formulaElement) {
    if (!formulaElement || !(formulaElement instanceof Element)) return null;

    // Method 1: data-custom-copy-text (Doubao format — current element)
    if (formulaElement.hasAttribute('data-custom-copy-text')) {
        return formulaElement.getAttribute('data-custom-copy-text').trim();
    }

    // Method 2: Walk up to find .math-inline parent with data-custom-copy-text
    const mathInlineParent = formulaElement.closest('.math-inline');
    if (mathInlineParent && mathInlineParent.hasAttribute('data-custom-copy-text')) {
        return mathInlineParent.getAttribute('data-custom-copy-text').trim();
    }

    // Method 3: Child element with data-custom-copy-text
    const customChild = formulaElement.querySelector('[data-custom-copy-text]');
    if (customChild) {
        return customChild.getAttribute('data-custom-copy-text').trim();
    }

    // Method 4: data-math attribute (Gemini and others — walk up ancestors)
    if (formulaElement.hasAttribute('data-math')) {
        return formulaElement.getAttribute('data-math').trim();
    }
    let parent = formulaElement.parentElement;
    while (parent && parent !== document.body) {
        if (parent.hasAttribute('data-math')) {
            return parent.getAttribute('data-math').trim();
        }
        parent = parent.parentElement;
    }

    // Method 5: KaTeX annotation[encoding="application/x-tex"]
    const annotation = formulaElement.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent?.trim()) {
        return annotation.textContent.trim();
    }

    // Method 6: .katex-mathml annotation (fallback)
    const katexMathmlAnnotation = formulaElement.querySelector('.katex-mathml annotation');
    if (katexMathmlAnnotation && katexMathmlAnnotation.textContent?.trim()) {
        return katexMathmlAnnotation.textContent.trim();
    }

    // Method 7: Any annotation with tex encoding
    const anyTexAnnotation = formulaElement.querySelector('annotation[encoding*="tex"], annotation[encoding*="TeX"]');
    if (anyTexAnnotation && anyTexAnnotation.textContent?.trim()) {
        return anyTexAnnotation.textContent.trim();
    }

    // Method 8: MediaWiki mwe-math-element annotation
    let mweElement = formulaElement;
    if (!formulaElement.classList.contains('mwe-math-element')) {
        mweElement = formulaElement.closest('.mwe-math-element');
    }
    if (mweElement) {
        const wikiAnnotation = mweElement.querySelector('annotation');
        if (wikiAnnotation && wikiAnnotation.textContent?.trim()) {
            let latex = wikiAnnotation.textContent.trim();
            // Clean Wikipedia's \displaystyle wrapper
            if (latex.startsWith('{\\displaystyle')) {
                latex = latex.replace(/^\{\\displaystyle\s*/, '').replace(/\}\s*$/, '').trim();
            }
            return latex || null;
        }
    }

    // Method 9: MathJax — sibling script[type="math/tex"]
    let nextSibling = formulaElement.nextElementSibling;
    if (nextSibling?.tagName === 'SCRIPT' && nextSibling.type?.startsWith('math/tex')) {
        return nextSibling.textContent.trim();
    }
    if (formulaElement.parentElement) {
        nextSibling = formulaElement.parentElement.nextElementSibling;
        if (nextSibling?.tagName === 'SCRIPT' && nextSibling.type?.startsWith('math/tex')) {
            return nextSibling.textContent.trim();
        }
    }

    // Method 10: Generic data attributes
    for (const attr of ['data-latex', 'data-tex', 'data-katex', 'data-formula',
                         'data-expr', 'data-expression', 'data-original',
                         'data-source', 'data-original-latex', 'data-math-content']) {
        const val = formulaElement.getAttribute(attr)
            || formulaElement.closest(`[${attr}]`)?.getAttribute(attr);
        if (val?.trim()) return val.trim();
    }

    // Method 11: script[type*="math/tex"] inside or nearby
    const mathScript = formulaElement.querySelector('script[type*="math/tex"], script[type*="math/mml"]');
    if (mathScript && mathScript.textContent?.trim()) {
        return mathScript.textContent.trim();
    }

    return null;
}

function cleanLatex(raw) {
    if (!raw) return null;
    let s = raw;
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
    s = s.replace(/\r\n|\r/g, '\n');
    s = s.replace(/\t/g, ' ');
    s = s.replace(/\u00A0/g, ' ');
    s = s.replace(/ {2,}/g, ' ');
    s = s.replace(/\s+\n/g, '\n');
    s = s.replace(/\n\s+/g, '\n');
    return s.trim() || null;
}

// ============================================================
//  Normalize: map any child element to its formula root
// ============================================================
function normalizeToFormulaRoot(element) {
    if (!(element instanceof Element)) return null;

    if (element.matches('annotation')) {
        const root = element.closest('.katex, .MathJax, .mjx-container, .mwe-math-element, .math-inline, .math-block, .math-display');
        if (root) return root;
    }

    const katex = element.closest('.katex');
    if (katex) return katex;

    const mathjax = element.closest('.MathJax, .MathJax_SVG, .mjx-container, .mjx-chtml');
    if (mathjax) return mathjax;

    const mwe = element.closest('.mwe-math-element');
    if (mwe) return mwe;

    const mathContainer = element.closest('.math-inline, .math-block, .math-display');
    if (mathContainer) return mathContainer;

    return element;
}

// ============================================================
//  Shadow DOM aware query
// ============================================================
function queryShadowRoot(root, selector) {
    const results = [];
    if (!(root instanceof Element) && root !== document && root !== document.body) return results;
    if (root.querySelectorAll) results.push(...root.querySelectorAll(selector));
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

// ============================================================
//  Clipboard
// ============================================================
async function copyToClipboard(text, element) {
    const preview = text.length > 80 ? `${text.substring(0, 80)}...` : text;
    try {
        await navigator.clipboard.writeText(text);
        showToast(`Copied: ${preview}`, true, element);
    } catch (error) {
        debugLog('Clipboard API failed, trying fallback', error);
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(`Copied: ${preview}`, true, element);
        } catch (fallbackError) {
            debugLog('Fallback clipboard method failed', fallbackError);
            showToast('Copy failed', false, element);
            if (browserAPI?.runtime) {
                browserAPI.runtime.sendMessage({ type: 'copyToClipboard', text });
            }
        }
    }
}

// ============================================================
//  Toast feedback — appears near the formula element
// ============================================================
let toastEl = null;
let toastTimer = null;

function showToast(message, isSuccess, anchorElement) {
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'copytex-toast';
        Object.assign(toastEl.style, {
            position: 'fixed', zIndex: '2147483647',
            padding: '10px 18px', borderRadius: '10px',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '13px', fontWeight: '500', letterSpacing: '0.3px',
            fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
            maxWidth: '380px', wordBreak: 'break-word', textAlign: 'center',
            pointerEvents: 'none', transition: 'opacity 0.25s ease, transform 0.25s ease',
            opacity: '0', transform: 'translateY(4px) scale(0.97)'
        });
        document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;

    if (isSuccess) {
        Object.assign(toastEl.style, {
            background: 'linear-gradient(140deg, rgba(10,36,99,0.92), rgba(12,88,138,0.94))',
            color: '#D8F2FF',
            borderColor: 'rgba(56,189,248,0.5)',
            boxShadow: '0 10px 30px rgba(15,118,230,0.3), 0 0 14px rgba(34,211,238,0.3)'
        });
    } else {
        Object.assign(toastEl.style, {
            background: 'linear-gradient(140deg, rgba(78,16,32,0.92), rgba(120,16,48,0.92))',
            color: '#FFE2EC',
            borderColor: 'rgba(248,113,113,0.5)',
            boxShadow: '0 10px 30px rgba(185,28,28,0.3), 0 0 14px rgba(248,113,113,0.3)'
        });
    }

    // Position near the anchor element
    if (anchorElement?.isConnected) {
        const rect = anchorElement.getBoundingClientRect();
        toastEl.style.display = 'block';
        toastEl.style.opacity = '0';
        const toastRect = toastEl.getBoundingClientRect();
        let top = rect.top - toastRect.height - 10;
        if (top < 8) top = rect.bottom + 10;
        let left = rect.left + rect.width / 2 - toastRect.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - toastRect.width - 8));
        toastEl.style.top = `${top}px`;
        toastEl.style.left = `${left}px`;
    } else {
        toastEl.style.top = '24px';
        toastEl.style.left = '50%';
        toastEl.style.transform = 'translateX(-50%) translateY(4px) scale(0.97)';
    }

    toastEl.style.display = 'block';
    requestAnimationFrame(() => {
        toastEl.style.opacity = '1';
        toastEl.style.transform = 'translateY(0) scale(1)';
    });

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        if (!toastEl) return;
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(4px) scale(0.97)';
        setTimeout(() => { if (toastEl) toastEl.style.display = 'none'; }, 250);
    }, 2200);
}

// ============================================================
//  Tooltip on hover
// ============================================================
let tooltipEl = null;
let tooltipTimer = null;

function showTooltip(text, anchor) {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'copytex-tooltip';
        Object.assign(tooltipEl.style, {
            position: 'fixed', zIndex: '2147483647',
            padding: '6px 12px', borderRadius: '8px',
            fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap',
            fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
            pointerEvents: 'none',
            transition: 'opacity 0.15s ease',
            opacity: '0', display: 'none',
            background: '#1a1a2e', color: '#e0e6ff',
            border: '1px solid rgba(102,126,234,0.3)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
        });
        document.body.appendChild(tooltipEl);
    }

    tooltipEl.textContent = text;
    tooltipEl.style.display = 'block';
    tooltipEl.style.opacity = '0';

    requestAnimationFrame(() => {
        if (!anchor?.isConnected) return;
        const rect = anchor.getBoundingClientRect();
        const ttRect = tooltipEl.getBoundingClientRect();
        let top = rect.top - ttRect.height - 8;
        if (top < 4) top = rect.bottom + 8;
        let left = rect.left + rect.width / 2 - ttRect.width / 2;
        left = Math.max(4, Math.min(left, window.innerWidth - ttRect.width - 4));
        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.opacity = '1';
    });

    if (tooltipTimer) clearTimeout(tooltipTimer);
}

function hideTooltip() {
    tooltipTimer = setTimeout(() => {
        if (tooltipEl) { tooltipEl.style.opacity = '0'; tooltipEl.style.display = 'none'; }
    }, 80);
}

// ============================================================
//  Inject minimal CSS for hover/interactive styles
// ============================================================
function injectStyles() {
    if (document.getElementById('copytex-styles')) return;
    const style = document.createElement('style');
    style.id = 'copytex-styles';
    style.textContent = `
        .copytex-interactive {
            position: relative;
            transition: background-color 0.2s ease;
            border-radius: 4px;
            cursor: pointer;
        }
        .copytex-interactive:hover {
            background-color: rgba(102, 126, 234, 0.10) !important;
        }
        .copytex-interactive:active {
            transform: scale(0.998);
        }
        @media (prefers-color-scheme: dark) {
            .copytex-interactive:hover {
                background-color: rgba(140, 160, 255, 0.12) !important;
            }
        }
    `;
    document.head.appendChild(style);
}

// ============================================================
//  Attach interactive handlers to a formula element
// ============================================================
function attachFormulaHandlers(formulaElement) {
    if (formulaElement.hasAttribute('data-copytex-ready')) return;
    if (!formulaElement.isConnected) return;

    // Pre-extract LaTeX — if extraction fails, don't attach interaction
    const latex = cleanLatex(extractLatex(formulaElement));
    if (!latex) return;

    formulaElement.setAttribute('data-copytex-ready', '1');
    formulaElement.setAttribute('data-copytex-latex', latex);
    formulaElement.classList.add('copytex-interactive');

    formulaElement.addEventListener('mouseenter', () => {
        showTooltip('Click to copy LaTeX', formulaElement);
    });

    formulaElement.addEventListener('mouseleave', () => {
        hideTooltip();
    });

    // Prevent default on mousedown to avoid canvas editing mode
    formulaElement.addEventListener('mousedown', (e) => {
        e.preventDefault();
    }, true);

    // Single click to copy
    formulaElement.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const src = formulaElement.getAttribute('data-copytex-latex');
        if (src) {
            copyToClipboard(src, formulaElement);
            hideTooltip();
        } else {
            showToast('No LaTeX source found', false, formulaElement);
        }
    }, true);
}

// ============================================================
//  Scan & attach — find all unprocessed formula elements
// ============================================================
function scanAndAttachFormulas() {
    let elements = [];
    try {
        elements = queryShadowRoot(document.body, FORMULA_SELECTORS);
    } catch (error) {
        debugLog('Formula selector scan failed', error);
        return;
    }

    elements.forEach(rawEl => {
        const formulaRoot = normalizeToFormulaRoot(rawEl);
        if (!formulaRoot) return;
        attachFormulaHandlers(formulaRoot);
    });

    // Also scan for MathJax script siblings
    try {
        const mathScripts = document.querySelectorAll('script[type^="math/tex"]');
        mathScripts.forEach(script => {
            if (!script.parentElement) return;
            const mjEl = script.parentElement.querySelector(
                '.MathJax_SVG:not([data-copytex-ready]), .MathJax:not([data-copytex-ready])'
            );
            if (mjEl) attachFormulaHandlers(mjEl);
        });
    } catch (e) { /* ignore */ }
}

// ============================================================
//  MutationObserver — detect new formulas as they render
// ============================================================
const debounce = (func, delay) => {
    let tid;
    return (...args) => { clearTimeout(tid); tid = setTimeout(() => func(...args), delay); };
};

const debouncedScan = debounce(() => scanAndAttachFormulas(), 300);

function initObserver() {
    if (!document.body) return;
    const observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.addedNodes && m.addedNodes.length > 0)) {
            debouncedScan();
        }
    });
    observer.observe(document.body, { subtree: true, childList: true });
}

// ============================================================
//  Initialize — runs on ANY page, no hostname check
// ============================================================
function initialize() {
    if (!document.body) return;
    if (document.documentElement.dataset.copytexInit === '1') return;
    document.documentElement.dataset.copytexInit = '1';

    injectStyles();
    scanAndAttachFormulas();
    initObserver();

    // Delayed rescans for dynamically rendered content
    setTimeout(scanAndAttachFormulas, 1500);
    setTimeout(scanAndAttachFormulas, 4000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
    initialize();
}
