// CopyTeX - Popup Script
// Handles feature toggles, prompt management, and conversation export

document.addEventListener('DOMContentLoaded', function () {
  // ---- Element refs ----
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
    'toggle-timeline': 'copytex_timeline_enabled',
    'toggle-prompts': 'copytex_prompts_enabled'
  };

  // Load saved toggle states
  chrome.storage.local.get(Object.values(toggleIds), function (result) {
    for (const [elId, storageKey] of Object.entries(toggleIds)) {
      const el = document.getElementById(elId);
      if (!el) continue;
      // Default to enabled (true) if not set
      el.checked = result[storageKey] !== false;
      el.addEventListener('change', function () {
        const obj = {};
        obj[storageKey] = el.checked;
        chrome.storage.local.set(obj);
      });
    }
  });

  // ============================================================
  //  2. Export Platform Detection
  // ============================================================
  const supportedHosts = [
    'chat.openai.com', 'chatgpt.com', 'gemini.google.com',
    'chat.deepseek.com', 'claude.ai', 'grok.com',
    'kimi.ai', 'kimi.moonshot.cn', 'poe.com'
  ];

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];
    if (!tab || !tab.id) { showNoPlatform('No active tab'); return; }
    currentTabId = tab.id;
    const url = tab.url || '';
    if (!supportedHosts.some(h => url.includes(h))) {
      showNoPlatform('Open an AI chat to export');
      return;
    }
    chrome.tabs.sendMessage(currentTabId, { type: 'detectExportPlatform' }, function (r) {
      if (chrome.runtime.lastError || !r) { showNoPlatform('Refresh page to connect'); return; }
      if (r.platform) {
        platformInfo.className = 'platform-bar ok';
        platformIcon.textContent = r.platform.icon || '✅';
        platformName.textContent = r.platform.name;
        const n = r.messageCount || 0;
        const t = r.title || '';
        let meta = n > 0 ? `${n} messages` : 'No messages yet';
        if (t) meta += ` · ${t.length > 30 ? t.substring(0, 30) + '…' : t}`;
        platformMeta.textContent = meta;
        exportBtn.disabled = n === 0;
      } else {
        showNoPlatform('Platform not recognized');
      }
    });
  });

  function showNoPlatform(msg) {
    platformInfo.className = 'platform-bar warn';
    platformIcon.textContent = '⚠️';
    platformName.textContent = msg;
    platformMeta.textContent = 'ChatGPT, Gemini, DeepSeek, Claude, Grok, Kimi, Poe';
    exportBtn.disabled = true;
  }

  // ============================================================
  //  3. Export Button
  // ============================================================
  exportBtn.addEventListener('click', function () {
    if (!currentTabId) return;
    exportBtn.disabled = true;
    exportBtnText.textContent = 'Exporting…';
    exportBtn.className = 'btn';
    exportStatus.textContent = '';
    exportStatus.className = 'export-msg';

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

  promptAddBtn.addEventListener('click', function () {
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
  promptContentInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      promptAddBtn.click();
    }
  });

  loadPrompts();
});
