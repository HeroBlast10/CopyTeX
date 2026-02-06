#!/usr/bin/env node

/**
 * Release preparation script for CopyTeX
 * Builds packages and creates store-ready ZIP files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Release configuration
const releaseConfig = {
    version: '1.0.2',
    browsers: ['chrome', 'firefox', 'edge', 'safari'],
    storeUrls: {
        chrome: 'https://chrome.google.com/webstore/devconsole/',
        firefox: 'https://addons.mozilla.org/developers/',
        edge: 'https://partner.microsoft.com/dashboard/microsoftedge/',
        safari: 'https://developer.apple.com/app-store-connect/'
    }
};

function log(message) {
    console.log(`[RELEASE] ${message}`);
}

function runCommand(command) {
    try {
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (error) {
        console.error(`Command failed: ${command}`);
        return false;
    }
}

function validateFiles() {
    log('Validating required files...');
    
    const requiredFiles = [
        'manifest.json',
        'manifest-v2.json',
        'content.js',
        'background.js',
        'popup.html',
        'popup.js',
        'styles.css',
        'icons/icon16.png',
        'icons/icon48.png',
        'icons/icon128.png',
        '_locales/en/messages.json',
        'README.md',
        'LICENSE'
    ];
    
    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missingFiles.length > 0) {
        console.error('Missing required files:');
        missingFiles.forEach(file => console.error(`  - ${file}`));
        return false;
    }
    
    log('✅ All required files present');
    return true;
}

function buildPackages() {
    log('Building browser packages...');
    
    if (!runCommand('node build.js')) {
        console.error('Build failed');
        return false;
    }
    
    log('✅ Packages built successfully');
    return true;
}

function createZipFiles() {
    log('Creating ZIP files for store submission...');
    
    const zipCommands = releaseConfig.browsers.map(browser => {
        const sourceDir = `dist/${browser}`;
        const zipFile = `dist/${browser}-v${releaseConfig.version}.zip`;
        
        if (!fs.existsSync(sourceDir)) {
            console.error(`Source directory not found: ${sourceDir}`);
            return null;
        }
        
        // Create ZIP file
        if (process.platform === 'win32') {
            return `powershell Compress-Archive -Path "${sourceDir}/*" -DestinationPath "${zipFile}" -Force`;
        } else {
            return `cd dist && zip -r ${browser}-v${releaseConfig.version}.zip ${browser}/`;
        }
    }).filter(cmd => cmd !== null);
    
    for (const command of zipCommands) {
        if (!runCommand(command)) {
            console.error('ZIP creation failed');
            return false;
        }
    }
    
    log('✅ ZIP files created successfully');
    return true;
}

function generateReleaseNotes() {
    const releaseNotes = `
# CopyTeX v${releaseConfig.version}

## 🌐 Multi-Browser Support
- Chrome (Manifest V3)
- Firefox (Manifest V2) 
- Edge (Manifest V3)
- Safari (WebExtensions)

## ✨ Features
- Universal compatibility with all major AI platforms
- Enhanced LaTeX extraction based on DeepSeekFormulaCopy
- Smart mathematical content recognition
- Cross-browser API compatibility
- Improved performance with Shadow DOM support

## 📦 Store Packages
${releaseConfig.browsers.map(browser => 
    `- ${browser.charAt(0).toUpperCase() + browser.slice(1)}: dist/${browser}-v${releaseConfig.version}.zip`
).join('\n')}

## 🔗 Store URLs
${Object.entries(releaseConfig.storeUrls).map(([browser, url]) => 
    `- ${browser.charAt(0).toUpperCase() + browser.slice(1)}: ${url}`
).join('\n')}

## 🚀 Installation
1. Download the appropriate package for your browser
2. Upload to the respective browser store
3. Complete store listing information
4. Submit for review

Generated on: ${new Date().toISOString()}
`;

    fs.writeFileSync('RELEASE_NOTES.md', releaseNotes.trim());
    log('✅ Release notes generated');
}

function showSummary() {
    log('\n🎉 Release preparation completed!');
    console.log('\n📦 Generated packages:');
    
    releaseConfig.browsers.forEach(browser => {
        const zipFile = `dist/${browser}-v${releaseConfig.version}.zip`;
        if (fs.existsSync(zipFile)) {
            const stats = fs.statSync(zipFile);
            console.log(`  ✅ ${browser}: ${zipFile} (${(stats.size / 1024).toFixed(1)} KB)`);
        } else {
            console.log(`  ❌ ${browser}: Package not found`);
        }
    });
    
    console.log('\n📋 Next steps:');
    console.log('1. Test each package in respective browsers');
    console.log('2. Upload packages to browser stores:');
    
    Object.entries(releaseConfig.storeUrls).forEach(([browser, url]) => {
        console.log(`   - ${browser.charAt(0).toUpperCase() + browser.slice(1)}: ${url}`);
    });
    
    console.log('3. Complete store listings with screenshots and descriptions');
    console.log('4. Submit for review');
    console.log('\n📄 See RELEASE_NOTES.md for detailed information');
}

function main() {
    log(`Starting release preparation for v${releaseConfig.version}...`);
    
    if (!validateFiles()) {
        process.exit(1);
    }
    
    if (!buildPackages()) {
        process.exit(1);
    }
    
    if (!createZipFiles()) {
        process.exit(1);
    }
    
    generateReleaseNotes();
    showSummary();
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, releaseConfig };
