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
popup.style.cssText = `
  position: fixed; 
  z-index: 2147483647; 
  background: #1e1e1e; 
  border: 1px solid #444; 
  color: #e0e0e0;
  padding: 12px; 
  box-shadow: 0 10px 25px rgba(0,0,0,0.5); 
  border-radius: 8px;
  width: 320px; 
  min-width: 250px;
  min-height: 200px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
  display: none; 
  flex-direction: column;
  resize: both; 
  overflow: hidden;
`;

// Added 'cursor: move' to header
popup.innerHTML = `
  <style>
    .ai-btn-modern {
      background: #333; border: 1px solid #555; cursor: pointer; color: #ccc;
      border-radius: 4px; padding: 2px 6px; font-size: 13px; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; line-height: 1;
    }
    .ai-btn-modern:hover { background: #444; color: #fff; border-color: #777; }
    .ai-btn-close { color: #eb5757; }
    .ai-btn-close:hover { background: #5c1e1e; color: #fff; border-color: #eb5757; }
  </style>
  <div id="ai-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; cursor: move; user-select: none;">
    <div id="ai-title-text" style="font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">
      ✨ AskInline
    </div>
    <div style="display: flex; gap: 8px;">
        <button id="ai-reset-btn" class="ai-btn-modern" title="Reset Chat">🔄</button>
        <button id="ai-close-btn" class="ai-btn-modern ai-btn-close" title="Close">&times;</button>
    </div>
  </div>
  
  <div id="sel-preview" style="font-size: 13px; color: #bbb; margin-bottom: 12px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 2px solid #007bff; padding-left: 5px;">...</div>
  
  <div id="ai-result" 
    style="margin-bottom: 12px; font-size: 14px; line-height: 1.5; flex-grow: 1; overflow-y: auto; overflow-wrap: anywhere;
           background: #252526; padding: 10px; border-radius: 4px; border: 1px solid #333; display:none; color: #ddd; min-height: 0;">
  </div>

  <input type="text" id="ai-user-prompt" placeholder="Add additional comments..." 
    style="width: 100%; margin-top: auto; margin-bottom: 10px; padding: 8px; box-sizing: border-box; font-size: 13px;
           background: #2d2d2d; border: 1px solid #444; color: white; border-radius: 4px; outline: none; flex-shrink: 0;">
  
  <div style="display: flex; gap: 8px; flex-shrink: 0;">
    <button id="ai-submit-btn" 
        style="flex: 1; background: #007bff; color: white; border: none; padding: 6px; 
            cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 13px; transition: background 0.2s;">
        Generate
    </button>

    <button id="ai-copy-btn" 
        style="background: #333; color: #ccc; border: 1px solid #555; padding: 6px 10px; 
            cursor: pointer; border-radius: 4px; font-weight: 500; font-size: 14px; display: none;"
        title="Copy Markdown">
        📋
    </button>
    
    <button id="ai-insert-btn" 
        style="background: #28a745; color: white; border: none; padding: 6px 10px; 
            cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 13px; display: none;"
        title="Insert into field">
        Insert
    </button>
  </div>
`;

document.body.appendChild(popup);

// --- Movable Logic (Minimal) ---
const header = popup.querySelector('#ai-header');
let isDragging = false, offsetX = 0, offsetY = 0;

header.addEventListener('mousedown', (e) => {
  // Prevent dragging if clicking on buttons
  if (e.target.tagName === 'BUTTON') return;
  isDragging = true;
  offsetX = e.clientX - popup.getBoundingClientRect().left;
  offsetY = e.clientY - popup.getBoundingClientRect().top;
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    // Fixed positioning logic: direct client coordinates
    popup.style.left = (e.clientX - offsetX) + 'px';
    popup.style.top = (e.clientY - offsetY) + 'px';
  }
});

document.addEventListener('mouseup', () => isDragging = false);


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
  savedSelection = selectionText || ""; // Store selection immediately, guard against null
  savedImageSrc = imageSrc || "";
  chatHistory = []; // Reset history



  // Smart Positioning: Keep inside Viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popupW = 346; // approx width + padding + border
  const popupH = 400; // estimated max height

  // Fixed positioning logic: use ClientX/Y immediately, no scroll offset needed
  // lastX/Y from contextmenu are pageX/Y, so we subtract scroll to get viewport relative
  let viewportX = lastX - window.scrollX;
  let viewportY = lastY - window.scrollY;

  // X axis: prevent overflow right
  let left = viewportX;
  if (viewportX + popupW > viewportWidth) {
    left = viewportWidth - popupW - 10;
  }

  // Y axis: flip up if overflow bottom
  let top = viewportY + 10;
  if (viewportY + 10 + popupH > viewportHeight) {
    top = viewportY - popupH;
  }

  // Safety clamps
  if (left < 0) left = 10;
  if (top < 0) top = 10;

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.style.display = 'flex';

  if (savedImageSrc) {
    document.getElementById('sel-preview').innerHTML = `<img src="${savedImageSrc}" style="max-height: 100px; display: block; border-radius: 4px;">`;
  } else {
    const safeSelection = savedSelection || "";
    const preview = safeSelection.length > 50 ? safeSelection.substring(0, 50) + '...' : safeSelection;
    document.getElementById('sel-preview').textContent = preview;
  }



  const resultDiv = document.getElementById('ai-result');
  resultDiv.style.display = 'none'; // Initially hidden
  resultDiv.innerHTML = ''; // Clear chat
  document.getElementById('ai-copy-btn').style.display = 'none'; // Hide copy button on new open
  document.getElementById('ai-insert-btn').style.display = 'none'; // Hide insert button on new open
  document.getElementById('ai-user-prompt').value = '';

  setTimeout(() => document.getElementById('ai-user-prompt').focus(), 100);
}

// --- Submit Logic ---
document.getElementById('ai-submit-btn').addEventListener('click', () => {
  const inputVal = document.getElementById('ai-user-prompt').value.trim();

  let fullPrompt = inputVal;

  let requestType = "selection";
  if (composeMode) {
    requestType = "fill";
  } else if (savedImageSrc) {
    requestType = "image";
  }

  // Show result div when submitting
  const resultDiv = document.getElementById('ai-result');
  resultDiv.style.display = 'block';

  // Render User Message
  const userMsg = inputVal ? inputVal : "Analysis request";
  resultDiv.innerHTML += `<div style="text-align: right; margin-bottom: 8px;"><span style="background: #0044cc; color: white; padding: 6px 10px; border-radius: 12px 12px 2px 12px; display: inline-block; font-size: 13px;">${userMsg}</span></div>`;
  resultDiv.scrollTop = resultDiv.scrollHeight;

  // Render Loading
  const loadingId = 'loading-' + Date.now();
  resultDiv.innerHTML += `<div id="${loadingId}" style="text-align: left; margin-bottom: 8px;"><span style="color: #888; font-style: italic;">Thinking...</span></div>`;
  resultDiv.scrollTop = resultDiv.scrollHeight;

  browser.runtime.sendMessage({
    action: "askAI",
    requestType: requestType,
    context: savedSelection,
    imageSrc: savedImageSrc,
    prompt: fullPrompt,
    history: chatHistory
  }, (response) => {
    // Remove Loading
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    if (response && response.answer) {
      lastRawResponse = response.answer; // Save mostly for copy (last one)
      let safeText = response.answer
        // 1. Intestazioni (### Titolo)
        .replace(/^### (.*$)/gim, '<h3 style="margin: 10px 0 5px; font-size: 16px; color: #fff;">$1</h3>')
        // 2. Grassetto (**testo**)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // 3. Corsivo (*testo* oppure _testo_)
        .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
        // 4. Codice inline (`codice`) - Con sfondo scuro per risaltare
        .replace(/`(.*?)`/g, '<code style="background:#333; padding:2px 4px; border-radius:3px; font-family:monospace; color: #ffcc00;">$1</code>')
        // 5. Elenchi puntati (Linee che iniziano con - o *)
        .replace(/^\s*[\-\*]\s+(.*)$/gm, '<div style="margin-left: 10px;">• $1</div>')
        // 6. Converti i restanti "a capo" in <br>
        .replace(/\n/g, ' ');

      // Render AI Response (No Bubble - ChatGPT style)
      resultDiv.innerHTML += `<div style="text-align: left; margin-bottom: 20px; color: #e0e0e0; font-size: 14px; line-height: 1.6;">${safeText}</div>`;
      resultDiv.scrollTop = resultDiv.scrollHeight;

      // Add to History
      chatHistory.push({ role: "user", text: fullPrompt });
      chatHistory.push({ role: "model", text: response.answer }); // Save raw answer

      document.getElementById('ai-copy-btn').style.display = 'block'; // Show copy button
      if (composeMode && lastTarget) {
        document.getElementById('ai-insert-btn').style.display = 'block'; // Show insert button
      }
    } else {
      resultDiv.innerHTML += `<div style="color: #ff5555; font-size: 13px;">Error: No response.</div>`;
    }
  });

  document.getElementById('ai-user-prompt').value = ''; // Clear input
});

// --- Enter Key Logic ---
document.getElementById('ai-user-prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('ai-submit-btn').click();
  }
});

// --- Pin Logic (Removed) ---

// --- Copy Logic ---
document.getElementById('ai-copy-btn').addEventListener('click', () => {
  if (!lastRawResponse) return;
  navigator.clipboard.writeText(lastRawResponse).then(() => {
    const btn = document.getElementById('ai-copy-btn');
    const originalText = btn.textContent;
    btn.textContent = "✅";
    setTimeout(() => btn.textContent = originalText, 2000);
  });
});

// --- Insert Logic ---
document.getElementById('ai-insert-btn').addEventListener('click', () => {
  if (!lastRawResponse || !lastTarget) return;

  // Clean markdown for insertion if needed, or insert raw
  let insertText = lastRawResponse;

  if (lastTarget.isContentEditable) {
    lastTarget.innerText = insertText;
  } else {
    // For input/textarea, prepend/append or overwrite based on selection? Let's just append for safety, or overwrite if empty.
    if (lastTarget.value) {
      lastTarget.value += "\n" + insertText;
    } else {
      lastTarget.value = insertText;
    }
  }

  // Dispatch events to trigger any JS listeners on the page
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

  // Provide visual feedback
  const title = document.getElementById('ai-title-text');
  const orig = title.textContent;
  title.textContent = "✨ Chat Reset";
  setTimeout(() => title.textContent = orig, 1000);
});

// --- Close Logic ---
document.getElementById('ai-close-btn').addEventListener('click', () => {
  popup.style.display = 'none';
});

// Removed mousedown outside-click handler since the modal is now permanently pinned until closed via X.
