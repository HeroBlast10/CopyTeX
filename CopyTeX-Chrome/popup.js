// CopyTeX - Popup Script
// Handles feature toggles, prompt management, and conversation export

document.addEventListener('DOMContentLoaded', function () {
  // ---- Element refs (with defensive null checks) ----
  const platformInfo = document.getElementById('platform-info');
  const platformIcon = document.getElementById('platform-icon');
  const platformName = document.getElementById('platform-name');
  const platformMeta = document.getElementById('platform-meta');
  const exportFormat = document.getElementById('export-format');
  const exportBtn = document.getElementById('export-btn');
  const exportBtnText = document.getElementById('export-btn-text');
  const exportStatus = document.getElementById('export-status');
  const promptList = document.getElementById('prompt-list');
  const promptEmpty = document.getElementById('prompt-empty');
  const promptNameInput = document.getElementById('prompt-name');
  const promptContentInput = document.getElementById('prompt-content');
  const promptAddBtn = document.getElementById('prompt-add-btn');

  let currentTabId = null;

  // ============================================================
  //  1. Feature Toggles
  // ============================================================
  const toggleIds = {
    'toggle-formula': 'copytex_formula_enabled',
    'toggle-prompts': 'copytex_prompts_enabled',
    'toggle-watermark': 'copytex_watermark_enabled'
  };

  try {
    chrome.storage.local.get(Object.values(toggleIds), function (result) {
      if (chrome.runtime.lastError) { console.warn('[CopyTeX Popup] Storage read error:', chrome.runtime.lastError); return; }
      for (const [elId, storageKey] of Object.entries(toggleIds)) {
        const el = document.getElementById(elId);
        if (!el) continue;
        el.checked = result[storageKey] !== false;
        el.addEventListener('change', function () {
          const obj = {};
          obj[storageKey] = el.checked;
          chrome.storage.local.set(obj);
        });
      }
    });
  } catch (e) { console.error('[CopyTeX Popup] Toggle init error:', e); }

  // ============================================================
  //  2. Export Platform Detection
  // ============================================================
  const supportedHosts = [
    'chat.openai.com', 'chatgpt.com', 'gemini.google.com',
    'chat.deepseek.com', 'claude.ai', 'grok.com',
    'kimi.ai', 'kimi.moonshot.cn', 'poe.com'
  ];

  try {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (chrome.runtime.lastError) { console.warn('[CopyTeX Popup] tabs.query error:', chrome.runtime.lastError); showNoPlatform('Cannot query tab'); return; }
      const tab = (tabs && tabs[0]) ? tabs[0] : null;
      if (!tab || !tab.id) { showNoPlatform('No active tab'); return; }
      currentTabId = tab.id;
      const url = tab.url || '';
      if (!supportedHosts.some(function(h) { return url.indexOf(h) !== -1; })) {
        showNoPlatform('Open an AI chat to export');
        return;
      }
      try {
        chrome.tabs.sendMessage(currentTabId, { type: 'detectExportPlatform' }, function (r) {
          if (chrome.runtime.lastError || !r) { showNoPlatform('Refresh page to connect'); return; }
          if (r.platform) {
            if (platformInfo) platformInfo.className = 'platform-bar ok';
            if (platformIcon) platformIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>';
            if (platformName) platformName.textContent = r.platform.name;
            var n = r.messageCount || 0;
            var t = r.title || '';
            var meta = n > 0 ? (n + ' messages') : 'No messages yet';
            if (t) meta += ' · ' + (t.length > 30 ? t.substring(0, 30) + '…' : t);
            if (platformMeta) platformMeta.textContent = meta;
            if (exportBtn) exportBtn.disabled = (n === 0);
          } else {
            showNoPlatform('Platform not recognized');
          }
        });
      } catch (e2) { console.error('[CopyTeX Popup] sendMessage error:', e2); showNoPlatform('Connection error'); }
    });
  } catch (e) { console.error('[CopyTeX Popup] tabs.query error:', e); showNoPlatform('Tab query failed'); }

  function showNoPlatform(msg) {
    if (platformInfo) platformInfo.className = 'platform-bar warn';
    if (platformIcon) platformIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    if (platformName) platformName.textContent = msg;
    if (platformMeta) platformMeta.textContent = 'ChatGPT, Gemini, DeepSeek, Claude, Grok, Kimi, Poe';
    if (exportBtn) exportBtn.disabled = true;
  }

  // ============================================================
  //  3. Export Button
  // ============================================================
  if (exportBtn) exportBtn.addEventListener('click', function () {
    if (!currentTabId) return;
    exportBtn.disabled = true;
    if (exportBtnText) exportBtnText.textContent = 'Exporting…';
    exportBtn.className = 'btn';
    if (exportStatus) { exportStatus.textContent = ''; exportStatus.className = 'export-msg'; }

    chrome.tabs.sendMessage(currentTabId, {
      type: 'exportConversation',
      format: exportFormat.value
    }, function (r) {
      if (chrome.runtime.lastError || !r) {
        exportBtn.className = 'btn err';
        exportBtnText.textContent = 'Failed';
        exportStatus.textContent = 'Could not export. Refresh and retry.';
        exportStatus.className = 'export-msg err';
        resetExport(); return;
      }
      if (r.success) {
        exportBtn.className = 'btn ok';
        exportBtnText.textContent = 'Done!';
        exportStatus.textContent = `${r.messageCount} messages from ${r.platform}`;
        exportStatus.className = 'export-msg ok';
      } else {
        exportBtn.className = 'btn err';
        exportBtnText.textContent = 'Failed';
        exportStatus.textContent = r.error || 'Export failed.';
        exportStatus.className = 'export-msg err';
      }
      resetExport();
    });
  });

  function resetExport() {
    setTimeout(function () {
      exportBtn.disabled = false;
      exportBtn.className = 'btn';
      exportBtnText.textContent = 'Export';
    }, 2500);
  }

  // ============================================================
  //  4. Prompt Management
  // ============================================================
  let prompts = [];

  function loadPrompts() {
    chrome.storage.local.get('copytex_prompts', function (r) {
      prompts = r.copytex_prompts || [];
      renderPrompts();
    });
  }

  function savePrompts() {
    chrome.storage.local.set({ copytex_prompts: prompts });
  }

  function renderPrompts() {
    if (!promptList) return;
    promptList.innerHTML = '';
    if (prompts.length === 0) {
      promptList.innerHTML = '<div class="prompt-empty">No prompts saved yet</div>';
      return;
    }
    prompts.forEach(function (p, i) {
      const item = document.createElement('div');
      item.className = 'prompt-item';
      item.title = p.content || '';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'pi-name';
      nameSpan.textContent = p.name || 'Untitled';
      const delBtn = document.createElement('button');
      delBtn.className = 'pi-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        prompts.splice(i, 1);
        savePrompts();
        renderPrompts();
      });
      item.appendChild(nameSpan);
      item.appendChild(delBtn);
      promptList.appendChild(item);
    });
  }

  if (promptAddBtn) promptAddBtn.addEventListener('click', function () {
    const name = promptNameInput.value.trim();
    const content = promptContentInput.value.trim();
    if (!name || !content) return;
    prompts.push({ id: Date.now().toString(), name, content });
    savePrompts();
    renderPrompts();
    promptNameInput.value = '';
    promptContentInput.value = '';
  });

  // Enter key in content input triggers add
  if (promptContentInput) promptContentInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      promptAddBtn.click();
    }
  });

  try { loadPrompts(); } catch(e) { console.error('[CopyTeX Popup] loadPrompts error:', e); }
});
