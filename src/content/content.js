// content.js — AskInline Content Script

let lastX = 0;
let lastY = 0;
let savedSelection = "";
let savedImageSrc = "";
let lastRawResponse = "";
let chatHistory = [];
let composeMode = false;
let lastTarget = null;
let currentTheme = "dark"; // Default theme

// --- Configure marked.js (v15 API) ---
if (typeof marked !== 'undefined') {
  marked.use({
    breaks: true,
    gfm: true,
    renderer: {
      code({ text, lang }) {
        let highlighted = text;
        if (typeof Prism !== 'undefined' && lang && Prism.languages[lang]) {
          try {
            highlighted = Prism.highlight(text, Prism.languages[lang], lang);
          } catch (e) {
            console.warn("AskInline: Prism highlight error:", lang, e);
          }
        } else {
          highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        const langLabel = lang ? `<div style="color: #666; font-size: 10px; margin-bottom: 4px; text-transform: uppercase;">${lang}</div>` : '';
        return `<pre><code class="language-${lang || ''}">${langLabel}${highlighted}</code></pre>`;
      }
    }
  });
}

// Listen for system theme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === "system") applyTheme("system");
  });
}

function applyTheme(theme) {
  currentTheme = theme;
  let isDark = theme === "dark";
  if (theme === "system") {
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  if (isDark) {
    popup.classList.remove('ai-theme-light');
  } else {
    popup.classList.add('ai-theme-light');
  }
  // Update theme toggle icon
  const themeBtn = popup.querySelector('#ai-theme-btn');
  if (themeBtn) {
    themeBtn.innerHTML = isDark
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }
}

// --- Track right-click position ---
document.addEventListener("contextmenu", (e) => {
  lastX = e.pageX;
  lastY = e.pageY;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
    lastTarget = e.target;
  } else {
    lastTarget = null;
  }
});

// --- Create Pop-up ---
const popup = document.createElement('div');
popup.id = 'gemini-inline-popup';

popup.innerHTML = `
  <div id="ai-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; cursor: move; user-select: none; flex-shrink: 0;">
    <div id="ai-title-text" style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">
      ✨ AskInline
    </div>
    <div style="display: flex; gap: 8px;">
        <button id="ai-theme-btn" class="ai-btn-modern" title="Toggle Theme">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        </button>
        <button id="ai-reset-btn" class="ai-btn-modern" title="Reset Chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        <button id="ai-close-btn" class="ai-btn-modern ai-btn-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
    </div>
  </div>
  
  <div id="sel-preview">...</div>
  <div id="sel-preview-toggle">▼ Show more</div>
  
  <div id="ai-result"></div>

  <textarea id="ai-user-prompt" placeholder="Add additional comments..."></textarea>
  
  <div style="display: flex; gap: 8px; flex-shrink: 0;">
    <button id="ai-submit-btn" class="ai-submit-btn">
        Generate
    </button>
    
    <button id="ai-insert-btn" class="ai-insert-btn" title="Insert into field" style="display: none;">
        Insert
    </button>
  </div>

  <!-- Custom Resize Handles -->
  <div class="ai-resize-handle ai-resize-right" data-resize="right"></div>
  <div class="ai-resize-handle ai-resize-bottom" data-resize="bottom"></div>
  <div class="ai-resize-handle ai-resize-corner" data-resize="corner"></div>
`;

document.body.appendChild(popup);

// --- Load Theme Preference (must be after popup is in DOM) ---
browser.storage.sync.get(["theme"]).then(result => {
  currentTheme = result.theme || "system";
  applyTheme(currentTheme);
});

// --- Theme Toggle ---
popup.querySelector('#ai-theme-btn').addEventListener('click', () => {
  const isCurrentlyLight = popup.classList.contains('ai-theme-light');
  const newTheme = isCurrentlyLight ? "dark" : "light";
  applyTheme(newTheme);
  browser.storage.sync.set({ theme: newTheme });
});

// --- Movable Logic ---
const header = popup.querySelector('#ai-header');
let isDragging = false, offsetX = 0, offsetY = 0;

header.addEventListener('mousedown', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  isDragging = true;
  offsetX = e.clientX - popup.getBoundingClientRect().left;
  offsetY = e.clientY - popup.getBoundingClientRect().top;
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    popup.style.left = (e.clientX - offsetX) + 'px';
    popup.style.top = (e.clientY - offsetY) + 'px';
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
  }
});

// --- Custom Resize Logic ---
let isResizing = false;
let resizeDir = null;
let resizeStartX = 0, resizeStartY = 0;
let resizeStartW = 0, resizeStartH = 0;

popup.querySelectorAll('.ai-resize-handle').forEach(handle => {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    resizeDir = handle.dataset.resize;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartW = popup.offsetWidth;
    resizeStartH = popup.offsetHeight;
  });
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const dx = e.clientX - resizeStartX;
  const dy = e.clientY - resizeStartY;

  if (resizeDir === 'right' || resizeDir === 'corner') {
    const newW = Math.max(280, resizeStartW + dx);
    popup.style.width = newW + 'px';
  }
  if (resizeDir === 'bottom' || resizeDir === 'corner') {
    const newH = Math.max(220, resizeStartH + dy);
    popup.style.height = newH + 'px';
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    resizeDir = null;
    savePopupPosition();
  }
});

// --- Persist Modal Position/Size ---
function savePopupPosition() {
  const rect = popup.getBoundingClientRect();
  browser.storage.local.set({
    popupPosition: {
      width: popup.style.width || (rect.width + 'px'),
      height: popup.style.height || (rect.height + 'px')
    }
  });
}

async function restorePopupPosition() {
  try {
    const result = await browser.storage.local.get("popupPosition");
    if (result.popupPosition) {
      const pos = result.popupPosition;
      if (pos.width) popup.style.width = pos.width;
      if (pos.height) popup.style.height = pos.height;
      return pos;
    }
  } catch (e) { }
  return null;
}

// --- Selection Preview Toggle ---
const selPreview = popup.querySelector('#sel-preview');
const selToggle = popup.querySelector('#sel-preview-toggle');

selToggle.addEventListener('click', () => {
  const isExpanded = selPreview.classList.toggle('ai-expanded');
  selToggle.textContent = isExpanded ? '▲ Show less' : '▼ Show more';
});

// --- Listen for Background Trigger ---
browser.runtime.onMessage.addListener((request) => {
  if (request.action === "openPopup") {
    composeMode = false;
    document.getElementById('ai-title-text').textContent = "✨ AskInline";
    showPopup(request.selectionText, request.imageSrc);
  } else if (request.action === "composeInline" && lastTarget) {
    composeMode = true;
    document.getElementById('ai-title-text').textContent = "✨ Compose Inline";
    showPopup("", "");
  } else if (request.action === "shortcutTriggered") {
    // Keyboard shortcut: open on current selection
    composeMode = false;
    document.getElementById('ai-title-text').textContent = "✨ AskInline";
    const selection = window.getSelection().toString().trim();
    // Position near center of viewport
    lastX = window.scrollX + window.innerWidth / 2;
    lastY = window.scrollY + window.innerHeight / 3;
    showPopup(selection, "");
  }
});

async function showPopup(selectionText, imageSrc) {
  savedSelection = selectionText || "";
  savedImageSrc = imageSrc || "";
  chatHistory = [];

  // Restore dimensions
  const savedPos = await restorePopupPosition();

  // Smart Positioning: Keep inside Viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popupW = savedPos ? parseInt(savedPos.width) || 380 : 380;
  const popupH = savedPos ? parseInt(savedPos.height) || 440 : 440;

  let viewportX = lastX - window.scrollX;
  let viewportY = lastY - window.scrollY;

  let left = viewportX;
  if (viewportX + popupW > viewportWidth) {
    left = viewportWidth - popupW - 10;
  }

  let top = viewportY + 10;
  if (viewportY + 10 + popupH > viewportHeight) {
    top = viewportY - popupH;
  }

  if (left < 0) left = 10;
  if (top < 0) top = 10;

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.style.display = 'flex';

  // --- Selection Preview (sanitized) ---
  const preview = document.getElementById('sel-preview');
  const toggle = document.getElementById('sel-preview-toggle');
  preview.classList.remove('ai-expanded');
  toggle.style.display = 'none';
  toggle.textContent = '▼ Show more';

  // Clear preview content safely
  preview.textContent = '';

  if (savedImageSrc) {
    const img = document.createElement('img');
    img.src = savedImageSrc;
    img.style.cssText = 'max-height: 100px; display: block; border-radius: 4px;';
    preview.appendChild(img);
  } else if (savedSelection) {
    const clip = document.createElement('span');
    clip.style.cssText = 'color: #999; margin-right: 4px;';
    clip.textContent = '📎';
    preview.appendChild(clip);
    preview.appendChild(document.createTextNode(savedSelection));
    // Show toggle if text is long enough to overflow
    requestAnimationFrame(() => {
      if (preview.scrollHeight > preview.clientHeight + 2) {
        toggle.style.display = 'block';
      }
    });
  } else {
    const noSel = document.createElement('span');
    noSel.style.color = '#666';
    noSel.textContent = 'No selection';
    preview.appendChild(noSel);
  }

  const resultDiv = document.getElementById('ai-result');
  resultDiv.style.display = 'none';
  resultDiv.innerHTML = '';
  document.getElementById('ai-insert-btn').style.display = 'none';
  document.getElementById('ai-user-prompt').value = '';

  setTimeout(() => document.getElementById('ai-user-prompt').focus(), 100);
}

// --- Markdown Renderer (uses marked.js) ---
function renderMarkdown(raw) {
  if (typeof marked !== 'undefined') {
    try {
      return marked.parse(raw);
    } catch (e) {
      console.warn("AskInline: marked.parse error:", e);
    }
  }
  // Fallback: escape HTML and add basic formatting
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// --- Submit Logic (Streaming via Port) ---
let activePort = null;

document.getElementById('ai-submit-btn').addEventListener('click', () => {
  const inputVal = document.getElementById('ai-user-prompt').value.trim();

  let fullPrompt = inputVal;
  let requestType = "selection";
  if (composeMode) {
    requestType = "fill";
  } else if (savedImageSrc) {
    requestType = "image";
  }

  // Show result div
  const resultDiv = document.getElementById('ai-result');
  resultDiv.style.display = 'block';

  // Render User Message (sanitized)
  const userMsg = inputVal ? inputVal : "Analysis request";
  const userBubble = document.createElement('div');
  userBubble.className = 'ai-user-bubble-container';
  const userSpan = document.createElement('span');
  userSpan.className = 'ai-user-bubble';
  userSpan.textContent = userMsg;
  userBubble.appendChild(userSpan);
  resultDiv.appendChild(userBubble);
  resultDiv.scrollTop = resultDiv.scrollHeight;

  // Create streaming response container
  const responseId = 'response-' + Date.now();
  const responseDiv = document.createElement('div');
  responseDiv.id = responseId;
  responseDiv.className = 'ai-response-container';
  responseDiv.innerHTML = '<span class="ai-stream-cursor">▌</span>';
  resultDiv.appendChild(responseDiv);
  resultDiv.scrollTop = resultDiv.scrollHeight;

  // Switch submit button to Stop mode
  const submitBtn = document.getElementById('ai-submit-btn');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Stop';
  submitBtn.classList.add('ai-stop-mode');

  // Replace click handler temporarily for stop functionality
  const stopHandler = () => {
    if (activePort) {
      try { activePort.disconnect(); } catch (e) { }
      activePort = null;
    }
    // Show partial response
    const respEl = document.getElementById(responseId);
    if (respEl) {
      // Remove the cursor
      const cursor = respEl.querySelector('.ai-stream-cursor');
      if (cursor) cursor.remove();
      // Add stopped indicator
      const stoppedEl = document.createElement('div');
      stoppedEl.style.cssText = 'color: #999; font-size: 11px; margin-top: 8px; font-style: italic;';
      stoppedEl.textContent = '— Stopped';
      respEl.appendChild(stoppedEl);
    }
    resetSubmitButton(submitBtn, stopHandler);
  };

  submitBtn.removeEventListener('click', submitClickHandler);
  submitBtn.addEventListener('click', stopHandler);

  // Open port to background
  activePort = browser.runtime.connect({ name: "askAI-stream" });
  let streamBuffer = "";

  activePort.onMessage.addListener((msg) => {
    const responseEl = document.getElementById(responseId);
    if (!responseEl) return;

    if (msg.chunk) {
      streamBuffer += msg.chunk;
      responseEl.innerHTML = renderMarkdown(streamBuffer) + '<span class="ai-stream-cursor">▌</span>';
      resultDiv.scrollTop = resultDiv.scrollHeight;
    } else if (msg.done) {
      lastRawResponse = msg.fullText;
      responseEl.innerHTML = renderMarkdown(msg.fullText);

      // Append Copy Button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-copy-response';
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      copyBtn.title = "Copy this response";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(msg.fullText).then(() => {
          const original = copyBtn.innerHTML;
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          setTimeout(() => { copyBtn.innerHTML = original; }, 2000);
        }).catch(() => { });
      };
      responseEl.insertBefore(copyBtn, responseEl.firstChild);
      resultDiv.scrollTop = resultDiv.scrollHeight;

      // Add to history
      chatHistory.push({ role: "user", text: fullPrompt });
      chatHistory.push({ role: "model", text: msg.fullText });

      if (composeMode && lastTarget) {
        document.getElementById('ai-insert-btn').style.display = 'block';
      }

      resetSubmitButton(submitBtn, stopHandler);
      activePort = null;
    } else if (msg.error) {
      responseEl.innerHTML = '';
      const errSpan = document.createElement('span');
      errSpan.style.color = '#ff5555';
      errSpan.textContent = msg.error;
      responseEl.appendChild(errSpan);
      resetSubmitButton(submitBtn, stopHandler);
      activePort = null;
    }
  });

  activePort.onDisconnect.addListener(() => {
    activePort = null;
    resetSubmitButton(submitBtn, stopHandler);
  });

  // Send the request via port
  activePort.postMessage({
    requestType: requestType,
    context: savedSelection,
    imageSrc: savedImageSrc,
    prompt: fullPrompt,
    history: chatHistory
  });

  document.getElementById('ai-user-prompt').value = '';
});

// Reference to the main submit handler for re-attachment
const submitClickHandler = () => {
  document.getElementById('ai-submit-btn').click();
};

function resetSubmitButton(btn, stopHandler) {
  btn.removeEventListener('click', stopHandler);
  btn.disabled = false;
  btn.textContent = 'Generate';
  btn.classList.remove('ai-stop-mode');
}

// --- Auto-Resize Textarea Logic ---
const promptInput = document.getElementById('ai-user-prompt');

promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = (Math.min(promptInput.scrollHeight, 80)) + 'px';
  if (promptInput.scrollHeight > 80) {
    promptInput.style.overflowY = 'auto';
  } else {
    promptInput.style.overflowY = 'hidden';
  }
});

// --- Enter Key Logic ---
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('ai-submit-btn').click();
  }
});

// --- Insert Logic ---
document.getElementById('ai-insert-btn').addEventListener('click', () => {
  if (!lastRawResponse || !lastTarget) return;

  let insertText = lastRawResponse;

  if (lastTarget.isContentEditable) {
    lastTarget.innerText = insertText;
  } else {
    if (lastTarget.value) {
      lastTarget.value += "\n" + insertText;
    } else {
      lastTarget.value = insertText;
    }
  }

  lastTarget.dispatchEvent(new Event('input', { bubbles: true }));
  lastTarget.dispatchEvent(new Event('change', { bubbles: true }));

  const btn = document.getElementById('ai-insert-btn');
  const originalText = btn.textContent;
  btn.textContent = "Inserted!";
  setTimeout(() => btn.textContent = originalText, 2000);
});

// --- Reset Logic ---
document.getElementById('ai-reset-btn').addEventListener('click', () => {
  chatHistory = [];
  lastRawResponse = "";
  document.getElementById('ai-result').innerHTML = '';
  document.getElementById('ai-result').style.display = 'none';
  document.getElementById('ai-user-prompt').value = '';
  document.getElementById('ai-insert-btn').style.display = 'none';

  const title = document.getElementById('ai-title-text');
  const orig = title.textContent;
  title.textContent = "✨ Chat Reset";
  setTimeout(() => title.textContent = orig, 1000);
});

// --- Close Logic ---
document.getElementById('ai-close-btn').addEventListener('click', () => {
  popup.style.display = 'none';
  // Disconnect any active stream
  if (activePort) {
    try { activePort.disconnect(); } catch (e) { }
    activePort = null;
  }
});
