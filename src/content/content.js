// content.js

let lastX = 0;
let lastY = 0;
let savedSelection = ""; // Fix: Store selection here
let savedImageSrc = ""; // Store image URL
let lastRawResponse = ""; // Store raw markdown for copying
let chatHistory = []; // Local history for current session
let composeMode = false; // Flag for inline composition
let lastTarget = null; // Store reference to clicked input/textarea

document.addEventListener("contextmenu", (e) => {
  lastX = e.pageX;
  lastY = e.pageY;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
    lastTarget = e.target;
  } else {
    lastTarget = null;
  }
});

// --- Create Pop-up (Dark Theme) ---
const popup = document.createElement('div');
popup.id = 'gemini-inline-popup';
// CSS is now loaded from content.css

popup.innerHTML = `
  <div id="ai-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; cursor: move; user-select: none; flex-shrink: 0;">
    <div id="ai-title-text" style="font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">
      ✨ AskInline
    </div>
    <div style="display: flex; gap: 8px;">
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
  
  <div id="ai-result" 
    style="margin-bottom: 10px; font-size: 14px; line-height: 1.6; flex: 1 1 0; overflow-y: auto; overflow-wrap: anywhere;
           background: #252526; padding: 10px; border-radius: 4px; border: 1px solid #333; display:none; color: #ddd; min-height: 0;">
  </div>

  <textarea id="ai-user-prompt" placeholder="Add additional comments..." 
    style="width: 100%; margin-bottom: 10px; padding: 8px; box-sizing: border-box; font-size: 13px;
           background: #2d2d2d; border: 1px solid #444; color: white; border-radius: 4px; outline: none; 
           flex-shrink: 0; margin-top: auto; resize: none; overflow: hidden; height: 34px; line-height: 1.4; font-family: inherit;"></textarea>
  
  <div style="display: flex; gap: 8px; flex-shrink: 0;">
    <button id="ai-submit-btn" 
        style="flex: 1; background: #007bff; color: white; border: none; padding: 6px; 
            cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 13px; transition: background 0.2s;">
        Generate
    </button>

    <!-- Legacy Copy Button Removed -->
    
    <button id="ai-insert-btn" 
        style="background: #28a745; color: white; border: none; padding: 6px 10px; 
            cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 13px; display: none;"
        title="Insert into field">
        Insert
    </button>
  </div>

  <!-- Custom Resize Handles -->
  <div class="ai-resize-handle ai-resize-right" data-resize="right"></div>
  <div class="ai-resize-handle ai-resize-bottom" data-resize="bottom"></div>
  <div class="ai-resize-handle ai-resize-corner" data-resize="corner"></div>
`;

document.body.appendChild(popup);

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

document.addEventListener('mouseup', () => isDragging = false);

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
  isResizing = false;
  resizeDir = null;
});

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
    showPopup("", ""); // Open without specific selection
  }
});

function showPopup(selectionText, imageSrc) {
  savedSelection = selectionText || "";
  savedImageSrc = imageSrc || "";
  chatHistory = [];

  // Smart Positioning: Keep inside Viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popupW = 380;
  const popupH = 440;

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

  // --- Selection Preview ---
  const preview = document.getElementById('sel-preview');
  const toggle = document.getElementById('sel-preview-toggle');
  preview.classList.remove('ai-expanded');
  toggle.style.display = 'none';
  toggle.textContent = '▼ Show more';

  if (savedImageSrc) {
    preview.innerHTML = `<img src="${savedImageSrc}" style="max-height: 100px; display: block; border-radius: 4px;">`;
  } else if (savedSelection) {
    const safeText = savedSelection.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    preview.innerHTML = `<span style="color: #999; margin-right: 4px;">📎</span>${safeText}`;
    // Show toggle if text is long enough to overflow
    requestAnimationFrame(() => {
      if (preview.scrollHeight > preview.clientHeight + 2) {
        toggle.style.display = 'block';
      }
    });
  } else {
    preview.innerHTML = '<span style="color: #666;">No selection</span>';
  }

  const resultDiv = document.getElementById('ai-result');
  resultDiv.style.display = 'none';
  resultDiv.innerHTML = '';
  document.getElementById('ai-copy-btn').style.display = 'none';
  document.getElementById('ai-insert-btn').style.display = 'none';
  document.getElementById('ai-user-prompt').value = '';

  setTimeout(() => document.getElementById('ai-user-prompt').focus(), 100);
}

// --- Markdown Renderer ---
function renderMarkdown(raw) {
  return raw
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre style="background: #111; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 8px 0;"><div style="color: #666; font-size: 10px; margin-bottom: 4px; text-transform: uppercase;">$1</div><code style="font-family: monospace; color: #ffcc00; display: block;">$2</code></pre>')
    .replace(/^### (.*$)/gim, '<h3 style="margin: 10px 0 5px; font-size: 16px; color: #fff;">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
    .replace(/`(.*?)`/g, '<code style="background:#333; padding:2px 4px; border-radius:3px; font-family:monospace; color: #ffcc00;">$1</code>')
    .replace(/^\s*[\-\*]\s+(.*)$/gm, '<div style="margin-left: 10px;">• $1</div>')
    .replace(/\n/g, '<br>');
}

// --- Submit Logic (Streaming via Port) ---
let activePort = null; // Track active streaming port

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

  // Render User Message
  const userMsg = inputVal ? inputVal : "Analysis request";
  resultDiv.innerHTML += `<div style="text-align: right; margin-bottom: 8px;"><span style="background: #0044cc; color: white; padding: 6px 10px; border-radius: 12px 12px 2px 12px; display: inline-block; font-size: 13px;">${userMsg}</span></div>`;
  resultDiv.scrollTop = resultDiv.scrollHeight;

  // Create streaming response container
  const responseId = 'response-' + Date.now();
  resultDiv.innerHTML += `<div id="${responseId}" style="text-align: left; margin-bottom: 20px; color: #e0e0e0; font-size: 14px; line-height: 1.6;"><span class="ai-stream-cursor">▌</span></div>`;
  resultDiv.scrollTop = resultDiv.scrollHeight;

  // Disable submit during streaming
  const submitBtn = document.getElementById('ai-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Streaming...';
  submitBtn.style.opacity = '0.6';

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
      
      // Append Copy Button for this specific response
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-copy-response';
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      copyBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; color: #666; padding: 4px; float: right; margin-left: 8px; transition: color 0.2s;';
      copyBtn.title = "Copy this response";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(msg.fullText).then(() => {
          const original = copyBtn.innerHTML;
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          copyBtn.style.color = '#4caf50';
          setTimeout(() => {
            copyBtn.innerHTML = original;
            copyBtn.style.color = '#666';
          }, 2000);
        });
      };
      
      // Insert button at the top of the response or after text? 
      // Let's prepend it so it floats right at the top
      responseEl.insertBefore(copyBtn, responseEl.firstChild);
      
      resultDiv.scrollTop = resultDiv.scrollHeight;

      // Add to history
      chatHistory.push({ role: "user", text: fullPrompt });
      chatHistory.push({ role: "model", text: msg.fullText });

      // document.getElementById('ai-copy-btn').style.display = 'block'; // Legacy global copy button
      if (composeMode && lastTarget) {
        document.getElementById('ai-insert-btn').style.display = 'block';
      }

      // Re-enable submit
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate';
      submitBtn.style.opacity = '1';
      activePort = null;
    } else if (msg.error) {
      responseEl.innerHTML = `<span style="color: #ff5555;">${msg.error}</span>`;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate';
      submitBtn.style.opacity = '1';
      activePort = null;
    }
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

// --- Auto-Resize Textarea Logic ---
const promptInput = document.getElementById('ai-user-prompt');

promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = (Math.min(promptInput.scrollHeight, 80)) + 'px'; // Max height approx 3-4 lines
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

/* Legacy Copy Logic Removed */

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
  document.getElementById('ai-copy-btn').style.display = 'none';
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
