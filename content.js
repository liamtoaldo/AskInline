// content.js

let lastX = 0;
let lastY = 0;
let savedSelection = ""; // Fix: Store selection here
let savedImageSrc = ""; // Store image URL
let lastRawResponse = ""; // Store raw markdown for copying
let isPinned = false; // Pin state
let chatHistory = []; // Local history for current session

document.addEventListener("contextmenu", (e) => {
  lastX = e.pageX;
  lastY = e.pageY;
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
  display: none; 
`;

// Added 'cursor: move' to header
popup.innerHTML = `
  <div id="ai-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; cursor: move; user-select: none;">
    <div style="font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">
      ✨ AskInline
    </div>
    <div style="display: flex; gap: 8px;">
        <button id="ai-pin-btn" style="background: none; border: none; cursor: pointer; font-size: 16px; color: #555; padding: 0;" title="Pin Modal">📌</button>
        <button id="ai-close-btn" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #888; padding: 0;">&times;</button>
    </div>
  </div>
  
  <div id="sel-preview" style="font-size: 13px; color: #bbb; margin-bottom: 12px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 2px solid #007bff; padding-left: 5px;">...</div>
  
  <div id="ai-result" 
    style="margin-bottom: 12px; font-size: 14px; line-height: 1.5; max-height: 250px; overflow-y: auto; 
           background: #252526; padding: 10px; border-radius: 4px; border: 1px solid #333; display:none; color: #ddd;">
  </div>

  <input type="text" id="ai-user-prompt" placeholder="Add additional comments..." 
    style="width: 100%; margin-bottom: 10px; padding: 8px; box-sizing: border-box; 
           background: #2d2d2d; border: 1px solid #444; color: white; border-radius: 4px; outline: none;">
  
  <div style="display: flex; gap: 8px;">
    <button id="ai-submit-btn" 
        style="flex: 1; background: #007bff; color: white; border: none; padding: 8px; 
            cursor: pointer; border-radius: 4px; font-weight: 600; transition: background 0.2s;">
        Generate
    </button>

    <button id="ai-copy-btn" 
        style="background: #333; color: #ccc; border: 1px solid #555; padding: 8px 12px; 
            cursor: pointer; border-radius: 4px; font-weight: 500; font-size: 16px; display: none;"
        title="Copy Markdown">
        📋
    </button>
  </div>
`;

document.body.appendChild(popup);

// --- Movable Logic (Minimal) ---
const header = popup.querySelector('#ai-header');
let isDragging = false, offsetX = 0, offsetY = 0;

header.addEventListener('mousedown', (e) => {
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
    showPopup(request.selectionText, request.imageSrc);
  }
});

function showPopup(selectionText, imageSrc) {
  savedSelection = selectionText || ""; // Store selection immediately, guard against null
  savedImageSrc = imageSrc || "";
  isPinned = false; // Reset pin state on new open
  chatHistory = []; // Reset history

  // Update Pin Button Style
  document.getElementById('ai-pin-btn').style.color = '#555';



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
  popup.style.display = 'block';

  if (savedImageSrc) {
    document.getElementById('sel-preview').innerHTML = `<img src="${savedImageSrc}" style="max-height: 100px; display: block; border-radius: 4px;">`;
  } else {
    const safeSelection = savedSelection || "";
    const preview = safeSelection.length > 50 ? safeSelection.substring(0, 50) + '...' : safeSelection;
    document.getElementById('sel-preview').textContent = preview;
  }



  document.getElementById('ai-result').style.display = 'block'; // Always block for chat
  document.getElementById('ai-result').innerHTML = ''; // Clear chat
  document.getElementById('ai-copy-btn').style.display = 'none'; // Hide copy button on new open
  document.getElementById('ai-user-prompt').value = '';

  setTimeout(() => document.getElementById('ai-user-prompt').focus(), 100);
}

// --- Submit Logic ---
document.getElementById('ai-submit-btn').addEventListener('click', () => {
  const inputVal = document.getElementById('ai-user-prompt').value.trim();

  // 2. Formatting Rule (Always included instructions)
  const styleRule = "Use Markdown formatting. Use **bold** for key terms. Do not overdo it. Keep lists clean.";

  // 3. Task Rule (Dynamic)
  let taskRule = "";
  let fullPrompt = "";

  if (chatHistory.length === 0) {
    // FIRST TURN: Include System Context Instructions
    const langRule = "Detect the language of the 'Context'. Answer strictly in that language. Do NOT mention the language detected, just start the answer immediately.";

    if (inputVal) {
      taskRule = `User question: "${inputVal}". Answer based on context.`;
    } else if (savedImageSrc) {
      taskRule = "Describe this image in detail.";
    } else {
      taskRule = "Explain the selected text clearly (approx. 80-100 words). Be comprehensive but concise.";
    }

    fullPrompt = `${langRule} ${styleRule} ${taskRule}`;
  } else {
    // FOLLOW-UP TURN: Just the question
    fullPrompt = inputVal;
  }

  // Render User Message
  const resultDiv = document.getElementById('ai-result');
  const userMsg = inputVal ? inputVal : "Analysis request";
  resultDiv.innerHTML += `<div style="text-align: right; margin-bottom: 8px;"><span style="background: #0044cc; color: white; padding: 6px 10px; border-radius: 12px 12px 2px 12px; display: inline-block; font-size: 13px;">${userMsg}</span></div>`;
  resultDiv.scrollTop = resultDiv.scrollHeight;

  // Render Loading
  const loadingId = 'loading-' + Date.now();
  resultDiv.innerHTML += `<div id="${loadingId}" style="text-align: left; margin-bottom: 8px;"><span style="color: #888; font-style: italic;">Thinking...</span></div>`;
  resultDiv.scrollTop = resultDiv.scrollHeight;

  browser.runtime.sendMessage({
    action: "askAI",
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
    } else {
      resultDiv.innerHTML += `<div style="color: #ff5555; font-size: 13px;">Error: No response.</div>`;
    }
  });

  document.getElementById('ai-user-prompt').value = ''; // Clear input
});

// --- Pin Logic ---
document.getElementById('ai-pin-btn').addEventListener('click', () => {
  isPinned = !isPinned;
  const pinBtn = document.getElementById('ai-pin-btn');
  if (isPinned) {
    pinBtn.style.color = '#007bff'; // Active blue
    pinBtn.title = "Unpin Modal";
  } else {
    pinBtn.style.color = '#555'; // Inactive grey
    pinBtn.title = "Pin Modal";
  }
});

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

// --- Close Logic ---
document.getElementById('ai-close-btn').addEventListener('click', () => {
  popup.style.display = 'none';
});

document.addEventListener('mousedown', (e) => {
  if (isPinned) return; // Do not close if pinned
  if (popup.style.display === 'block' && !popup.contains(e.target) && e.target !== header) {
    popup.style.display = 'none';
  }
});
