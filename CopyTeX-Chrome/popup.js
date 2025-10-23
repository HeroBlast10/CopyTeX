// Popup script for Gemini LaTeX Copier

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  
  // Check if we're on a Gemini tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    
    if (currentTab && currentTab.url && currentTab.url.includes('gemini.google.com')) {
      statusElement.textContent = '✅ Extension is active on Gemini';
      statusElement.className = 'status active';
    } else {
      statusElement.textContent = '⚠️ Navigate to gemini.google.com to use';
      statusElement.className = 'status inactive';
      statusElement.style.background = '#fef7e0';
      statusElement.style.color = '#b06000';
      statusElement.style.border = '1px solid #fdd663';
    }
  });
});
