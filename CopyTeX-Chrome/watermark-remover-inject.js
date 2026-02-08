// CopyTeX - Watermark Remover (Main World Injection)
// This script runs in the PAGE's main JS world to intercept window.fetch
// for Gemini image download URLs and remove watermarks before they reach the browser.

(function () {
    'use strict';

    // ========================================================================
    //  Constants
    // ========================================================================
    const ALPHA_THRESHOLD = 0.002;
    const MAX_ALPHA = 0.99;
    const LOGO_VALUE = 255;

    // URL pattern: Gemini generated image assets (render & download), but NOT =s0-d (user uploads)
    const GEMINI_URL_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\/rd-gg(?:-dl)?\/.*=s(?!0-d\?).*/;

    // Alpha maps received from content script
    let alphaMaps = {};
    let engineReady = false;

    // ========================================================================
    //  Receive alpha maps from content script
    // ========================================================================
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'COPYTEX_WATERMARK_ALPHA_MAPS') {
            // Reconstruct Float32Arrays from transferred arrays
            const maps = event.data.maps;
            for (const size in maps) {
                alphaMaps[size] = new Float32Array(maps[size]);
            }
            engineReady = true;
            console.log('[CopyTeX Watermark] Main world engine ready with alpha maps:', Object.keys(alphaMaps));
        }
    });

    // ========================================================================
    //  Watermark removal core
    // ========================================================================
    function detectWatermarkConfig(w, h) {
        if (w > 1024 && h > 1024) {
            return { logoSize: 96, marginRight: 64, marginBottom: 64 };
        }
        return { logoSize: 48, marginRight: 32, marginBottom: 32 };
    }

    function removeWatermarkFromImageData(imageData) {
        const w = imageData.width;
        const h = imageData.height;
        const config = detectWatermarkConfig(w, h);
        const alphaMap = alphaMaps[config.logoSize];
        if (!alphaMap) return;

        const logoSize = config.logoSize;
        const posX = w - config.marginRight - logoSize;
        const posY = h - config.marginBottom - logoSize;

        for (let row = 0; row < logoSize; row++) {
            for (let col = 0; col < logoSize; col++) {
                const imgIdx = ((posY + row) * w + (posX + col)) * 4;
                const alphaIdx = row * logoSize + col;
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

    // Replace thumbnail size param with full-size
    function replaceWithNormalSize(url) {
        return url.replace(/=s\d+(?=[-?#]|$)/, '=s0');
    }

    // Process a blob: decode → remove watermark → re-encode
    async function processBlob(blob) {
        const blobUrl = URL.createObjectURL(blob);
        try {
            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = blobUrl;
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            removeWatermarkFromImageData(imageData);
            ctx.putImageData(imageData, 0, 0);

            return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }

    // ========================================================================
    //  Fetch interception
    // ========================================================================
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');

        if (engineReady && GEMINI_URL_PATTERN.test(url)) {
            console.log('[CopyTeX Watermark] Intercepting fetch:', url.substring(0, 80) + '...');

            // Rewrite URL to full-size
            const normalUrl = replaceWithNormalSize(url);
            if (typeof args[0] === 'string') {
                args[0] = normalUrl;
            } else if (args[0] && args[0].url) {
                args[0] = new Request(normalUrl, args[0]);
            }

            const response = await origFetch.apply(this, args);
            if (!response.ok) return response;

            try {
                const originalBlob = await response.blob();
                const processedBlob = await processBlob(originalBlob);
                console.log('[CopyTeX Watermark] Fetch interception: watermark removed');
                return new Response(processedBlob, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            } catch (err) {
                console.warn('[CopyTeX Watermark] Fetch processing failed:', err);
                return origFetch.apply(this, args);
            }
        }

        return origFetch.apply(this, args);
    };

    console.log('[CopyTeX Watermark] Main world fetch interceptor installed');
})();
