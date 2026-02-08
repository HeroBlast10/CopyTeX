// CopyTeX - Gemini Watermark Remover
// Lossless watermark removal for Gemini-generated images using Reverse Alpha Blending
// Based on the algorithm by journey-ad/gemini-watermark-remover and allenk/GeminiWatermarkTool

(function () {
    'use strict';

    // Cross-browser API compatibility
    const browserAPI = (() => {
        if (typeof browser !== 'undefined') return browser;
        if (typeof chrome !== 'undefined') return chrome;
        return null;
    })();

    // Only run on Gemini
    if (!window.location.hostname.includes('gemini.google.com')) return;

    // ========================================================================
    //  Constants
    // ========================================================================
    const ALPHA_THRESHOLD = 0.002;
    const MAX_ALPHA = 0.99;
    const LOGO_VALUE = 255;

    // ========================================================================
    //  Alpha Map Calculation
    // ========================================================================
    function calculateAlphaMap(bgCaptureImageData) {
        const { width, height, data } = bgCaptureImageData;
        const alphaMap = new Float32Array(width * height);
        for (let i = 0; i < alphaMap.length; i++) {
            const idx = i * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const maxChannel = Math.max(r, g, b);
            alphaMap[i] = maxChannel / 255.0;
        }
        return alphaMap;
    }

    // ========================================================================
    //  Reverse Alpha Blending
    // ========================================================================
    function removeWatermark(imageData, alphaMap, position) {
        const { x, y, width, height } = position;
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
                const alphaIdx = row * width + col;
                let alpha = alphaMap[alphaIdx];
                if (alpha < ALPHA_THRESHOLD) continue;
                alpha = Math.min(alpha, MAX_ALPHA);
                const oneMinusAlpha = 1.0 - alpha;
                for (let c = 0; c < 3; c++) {
                    const watermarked = imageData.data[imgIdx + c];
                    const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;
                    imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
                }
            }
        }
    }

    // ========================================================================
    //  Watermark Config Detection
    // ========================================================================
    function detectWatermarkConfig(imageWidth, imageHeight) {
        if (imageWidth > 1024 && imageHeight > 1024) {
            return { logoSize: 96, marginRight: 64, marginBottom: 64 };
        } else {
            return { logoSize: 48, marginRight: 32, marginBottom: 32 };
        }
    }

    function calculateWatermarkPosition(imageWidth, imageHeight, config) {
        const { logoSize, marginRight, marginBottom } = config;
        return {
            x: imageWidth - marginRight - logoSize,
            y: imageHeight - marginBottom - logoSize,
            width: logoSize,
            height: logoSize
        };
    }

    // ========================================================================
    //  Watermark Engine
    // ========================================================================
    class WatermarkEngine {
        constructor() {
            this.alphaMaps = {};
            this.bgImages = {};
            this.ready = false;
        }

        async init() {
            try {
                const bg48Url = browserAPI.runtime.getURL('assets/bg_48.png');
                const bg96Url = browserAPI.runtime.getURL('assets/bg_96.png');

                const [bg48, bg96] = await Promise.all([
                    this._loadImage(bg48Url),
                    this._loadImage(bg96Url)
                ]);

                this.bgImages[48] = bg48;
                this.bgImages[96] = bg96;
                this.ready = true;
                console.log('[CopyTeX Watermark] Engine initialized');
            } catch (error) {
                console.error('[CopyTeX Watermark] Failed to initialize engine:', error);
            }
        }

        _loadImage(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to load: ' + src));
                img.src = src;
            });
        }

        _getAlphaMap(size) {
            if (this.alphaMaps[size]) return this.alphaMaps[size];

            const bgImage = this.bgImages[size];
            if (!bgImage) return null;

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bgImage, 0, 0);
            const imageData = ctx.getImageData(0, 0, size, size);
            const alphaMap = calculateAlphaMap(imageData);
            this.alphaMaps[size] = alphaMap;
            return alphaMap;
        }

        processImage(image) {
            if (!this.ready) return null;

            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const config = detectWatermarkConfig(canvas.width, canvas.height);
            const position = calculateWatermarkPosition(canvas.width, canvas.height, config);
            const alphaMap = this._getAlphaMap(config.logoSize);

            if (!alphaMap) return null;

            removeWatermark(imageData, alphaMap, position);
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        }
    }

    // ========================================================================
    //  Gemini Image Detection & Processing
    // ========================================================================
    const engine = new WatermarkEngine();
    const processingSet = new Set();
    let enabled = true;

    // URL pattern for Gemini-generated images
    function isGeminiGeneratedImage(img) {
        const src = img.src || '';
        if (!src.includes('googleusercontent.com')) return false;
        // Check if it's inside a generated-image container
        if (img.closest('generated-image, .generated-image-container')) return true;
        // Also match by URL pattern for Gemini render/download URLs
        if (/\/rd-gg(?:-dl)?\//.test(src)) return true;
        return false;
    }

    // Replace thumbnail URL with full-size URL
    function getFullSizeUrl(src) {
        return src.replace(/=s\d+(?=[-?#]|$)/, '=s0');
    }

    // Fetch image via background script to bypass CORS restrictions
    function fetchImageViaBackground(url) {
        return new Promise((resolve, reject) => {
            browserAPI.runtime.sendMessage({ type: 'fetchImageAsDataUrl', url }, (response) => {
                if (browserAPI.runtime.lastError) {
                    reject(new Error(browserAPI.runtime.lastError.message));
                } else if (!response || response.error) {
                    reject(new Error(response ? response.error : 'No response'));
                } else {
                    resolve(response.dataUrl);
                }
            });
        });
    }

    // Load an image from a data URL
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = src;
        });
    }

    async function processImageElement(imgElement) {
        if (!engine.ready || !enabled) return;
        if (processingSet.has(imgElement)) return;
        if (imgElement.dataset.copytexWatermark === 'done' || imgElement.dataset.copytexWatermark === 'processing') return;

        processingSet.add(imgElement);
        imgElement.dataset.copytexWatermark = 'processing';

        const originalSrc = imgElement.src;
        try {
            // Fetch full-size image via background script (bypasses CORS)
            const fullSizeUrl = getFullSizeUrl(originalSrc);
            const dataUrl = await fetchImageViaBackground(fullSizeUrl);
            const fullImg = await loadImage(dataUrl);

            const processedCanvas = engine.processImage(fullImg);

            if (!processedCanvas) {
                imgElement.dataset.copytexWatermark = 'failed';
                processingSet.delete(imgElement);
                return;
            }

            const processedBlob = await new Promise(resolve =>
                processedCanvas.toBlob(resolve, 'image/png')
            );

            const processedUrl = URL.createObjectURL(processedBlob);

            // Store original src for potential restore
            if (!imgElement.dataset.copytexOriginalSrc) {
                imgElement.dataset.copytexOriginalSrc = originalSrc;
            }

            imgElement.src = processedUrl;
            imgElement.dataset.copytexWatermark = 'done';
            console.log('[CopyTeX Watermark] Processed image successfully');
        } catch (error) {
            console.warn('[CopyTeX Watermark] Failed to process image:', error);
            imgElement.dataset.copytexWatermark = 'failed';
            imgElement.src = originalSrc;
        } finally {
            processingSet.delete(imgElement);
        }
    }

    function findAndProcessImages() {
        if (!enabled || !engine.ready) return;
        const images = document.querySelectorAll('img[src*="googleusercontent.com"]');
        images.forEach(img => {
            if (isGeminiGeneratedImage(img) && !img.dataset.copytexWatermark) {
                processImageElement(img);
            }
        });
    }

    // ========================================================================
    //  Main World Fetch Interception
    //  Inject a script into the page's main JS world to intercept
    //  window.fetch for Gemini image download URLs.
    // ========================================================================
    function injectMainWorldScript() {
        const scriptUrl = browserAPI.runtime.getURL('watermark-remover-inject.js');
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);
    }

    function sendAlphaMapsToMainWorld() {
        if (!engine.ready) return;
        // Convert Float32Arrays to plain arrays for postMessage transfer
        const maps = {};
        for (const size in engine.alphaMaps) {
            maps[size] = Array.from(engine.alphaMaps[size]);
        }
        window.postMessage({
            type: 'COPYTEX_WATERMARK_ALPHA_MAPS',
            maps: maps
        }, '*');
        console.log('[CopyTeX Watermark] Sent alpha maps to main world');
    }

    // ========================================================================
    //  Mutation Observer
    // ========================================================================
    let observer = null;
    let debounceTimer = null;

    function setupObserver() {
        if (observer) return;
        observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(findAndProcessImages, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('[CopyTeX Watermark] MutationObserver active');
    }

    function destroyObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        clearTimeout(debounceTimer);
    }

    // ========================================================================
    //  Enable / Disable
    // ========================================================================
    function enable() {
        if (enabled) return;
        enabled = true;
        if (engine.ready) {
            findAndProcessImages();
            setupObserver();
        }
    }

    function disable() {
        enabled = false;
        destroyObserver();
        // Restore original images
        document.querySelectorAll('[data-copytex-watermark]').forEach(img => {
            const orig = img.dataset.copytexOriginalSrc;
            if (orig) {
                img.src = orig;
            }
            delete img.dataset.copytexWatermark;
            delete img.dataset.copytexOriginalSrc;
        });
    }

    // ========================================================================
    //  Storage Listener
    // ========================================================================
    function listenForToggle() {
        browserAPI.storage.local.get('copytex_watermark_enabled', (result) => {
            if (result.copytex_watermark_enabled === false) {
                disable();
            }
        });

        browserAPI.storage.onChanged.addListener((changes) => {
            if (changes.copytex_watermark_enabled) {
                if (changes.copytex_watermark_enabled.newValue === false) {
                    disable();
                } else {
                    enable();
                }
            }
        });
    }

    // ========================================================================
    //  Initialization
    // ========================================================================
    async function init() {
        listenForToggle();
        await engine.init();
        if (!engine.ready || !enabled) return;

        // Pre-compute alpha maps so they are cached
        engine._getAlphaMap(48);
        engine._getAlphaMap(96);

        // Inject main-world fetch interceptor and send alpha maps
        injectMainWorldScript();
        // Small delay to ensure the injected script is loaded before sending data
        setTimeout(sendAlphaMapsToMainWorld, 200);

        findAndProcessImages();
        setupObserver();

        console.log('[CopyTeX Watermark] Ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
