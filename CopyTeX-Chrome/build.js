#!/usr/bin/env node

/**
 * Build script for CopyTeX
 * Generates browser-specific packages for Chrome, Firefox, Edge, and Safari
 */

const fs = require('fs');
const path = require('path');

// Browser configurations
const browsers = {
    chrome: {
        name: 'chrome',
        manifest: 'manifest.json', // Manifest V3
        outputDir: 'dist/chrome'
    },
    firefox: {
        name: 'firefox',
        manifest: 'manifest-v2.json', // Manifest V2
        outputDir: 'dist/firefox'
    },
    edge: {
        name: 'edge',
        manifest: 'manifest.json', // Manifest V3 (same as Chrome)
        outputDir: 'dist/edge'
    },
    safari: {
        name: 'safari',
        manifest: 'manifest-v2.json', // Manifest V2 (Safari uses WebExtensions)
        outputDir: 'dist/safari'
    }
};

// Files to copy to all browser packages
const commonFiles = [
    'content.js',
    'background.js',
    'styles.css',
    'popup.html',
    'popup.js',
    'icons/',
    '_locales/',
    'README.md'
];

// Create directory if it doesn't exist
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Copy file or directory
function copyFileOrDir(src, dest) {
    const stat = fs.statSync(src);
    
    if (stat.isDirectory()) {
        ensureDir(dest);
        const files = fs.readdirSync(src);
        files.forEach(file => {
            copyFileOrDir(path.join(src, file), path.join(dest, file));
        });
    } else {
        ensureDir(path.dirname(dest));
        fs.copyFileSync(src, dest);
    }
}

// Build package for specific browser
function buildBrowser(browserConfig) {
    console.log(`Building ${browserConfig.name} package...`);
    
    const outputDir = browserConfig.outputDir;
    ensureDir(outputDir);
    
    // Copy common files
    commonFiles.forEach(file => {
        const srcPath = file.endsWith('/') ? file.slice(0, -1) : file;
        if (fs.existsSync(srcPath)) {
            const destPath = path.join(outputDir, file.endsWith('/') ? path.basename(srcPath) : file);
            copyFileOrDir(srcPath, destPath);
        }
    });
    
    // Copy appropriate manifest
    const manifestSrc = browserConfig.manifest;
    const manifestDest = path.join(outputDir, 'manifest.json');
    fs.copyFileSync(manifestSrc, manifestDest);
    
    console.log(`✅ ${browserConfig.name} package built in ${outputDir}`);
}

// Clean dist directory
function clean() {
    if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true, force: true });
    }
}

// Main build function
function build() {
    console.log('🚀 Building CopyTeX for all browsers...\n');
    
    // Clean previous builds
    clean();
    
    // Build for each browser
    Object.values(browsers).forEach(buildBrowser);
    
    console.log('\n🎉 Build completed successfully!');
    console.log('\nGenerated packages:');
    Object.values(browsers).forEach(browser => {
        console.log(`  - ${browser.name}: ${browser.outputDir}/`);
    });
    
    console.log('\nNext steps:');
    console.log('  1. Test each package in respective browsers');
    console.log('  2. Create ZIP files for store submissions:');
    console.log('     - Chrome Web Store: dist/chrome/');
    console.log('     - Firefox Add-ons: dist/firefox/');
    console.log('     - Edge Add-ons: dist/edge/');
    console.log('     - Safari Extensions: dist/safari/');
}

// Run build if called directly
if (require.main === module) {
    build();
}

module.exports = { build, browsers };
