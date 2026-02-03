// content.js

let lastX = 0;
let lastY = 0;
let savedSelection = ""; // Fix: Store selection here
let lastRawResponse = ""; // Store raw markdown for copying

document.addEventListener("contextmenu", (e) => {
  lastX = e.pageX;
  lastY = e.pageY;
});

// --- Create Pop-up (Dark Theme) ---
const popup = document.createElement('div');
popup.id = 'gemini-inline-popup';
popup.style.cssText = `
  position: absolute; 
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
    <button id="ai-close-btn" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #888; padding: 0;">&times;</button>
  </div>
  
  <div id="sel-preview" style="font-size: 13px; color: #bbb; margin-bottom: 12px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 2px solid #007bff; padding-left: 5px;">...</div>
  
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
  
  <div id="ai-result" 
    style="margin-top: 12px; font-size: 14px; line-height: 1.5; max-height: 250px; overflow-y: auto; 
           background: #252526; padding: 10px; border-radius: 4px; border: 1px solid #333; display:none; color: #ddd;">
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
    popup.style.left = (e.clientX - offsetX + window.scrollX) + 'px';
    popup.style.top = (e.clientY - offsetY + window.scrollY) + 'px';
  }
});

document.addEventListener('mouseup', () => isDragging = false);


// --- Listen for Background Trigger ---
browser.runtime.onMessage.addListener((request) => {
  if (request.action === "openPopup") {
    showPopup(request.selectionText);
  }
});

function showPopup(selectionText) {
  savedSelection = selectionText || ""; // Store selection immediately, guard against null


  // Smart Positioning: Keep inside Viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popupW = 346; // approx width + padding + border
  const popupH = 400; // estimated max height

  // X axis: prevent overflow right
  let left = lastX;
  if (lastX - window.scrollX + popupW > viewportWidth) {
    left = window.scrollX + viewportWidth - popupW - 10;
  }

  // Y axis: flip up if overflow bottom
  let top = lastY + 10;
  if (lastY - window.scrollY + popupH > viewportHeight) {
    top = lastY - popupH;
  }

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.style.display = 'block';

  const safeSelection = savedSelection || "";
  const preview = safeSelection.length > 50 ? safeSelection.substring(0, 50) + '...' : safeSelection;
  document.getElementById('sel-preview').textContent = preview;

  document.getElementById('ai-result').style.display = 'none';
  document.getElementById('ai-result').textContent = '';
  document.getElementById('ai-copy-btn').style.display = 'none'; // Hide copy button on new open
  document.getElementById('ai-user-prompt').value = '';

  setTimeout(() => document.getElementById('ai-user-prompt').focus(), 100);
}

// --- Submit Logic ---
document.getElementById('ai-submit-btn').addEventListener('click', () => {
  const inputVal = document.getElementById('ai-user-prompt').value.trim();
  const resultDiv = document.getElementById('ai-result');

  // 1. Language Rule
  const langRule = "Detect the language of the 'Context'. Answer strictly in that language. Do NOT mention the language detected, just start the answer immediately.";

  // 2. Formatting Rule (NUOVO: Istruisce sull'uso del Markdown)
  const styleRule = "Use Markdown formatting to improve readability: use **bold** for key terms and bullet points for lists. Do not overdo it, keep it clean.";

  // 3. Task Rule
  let taskRule = "";
  if (inputVal) {
    taskRule = `User question: "${inputVal}". Answer based on context.`;
  } else {
    taskRule = "Explain the selected text clearly (approx. 80-100 words). Be comprehensive but concise.";
  }

  // Combina tutto
  const finalPrompt = `${langRule} ${styleRule} ${taskRule}`;

  // ... (il resto del codice rimane uguale: resultDiv.innerHTML, sendMessage, ecc.)
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span style="color:#888;">Thinking...</span>';

  browser.runtime.sendMessage({
    action: "askAI",
    context: savedSelection,
    prompt: finalPrompt
  }, (response) => {
    if (response && response.answer) {
      lastRawResponse = response.answer; // Save raw response
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

      resultDiv.innerHTML = safeText;
      document.getElementById('ai-copy-btn').style.display = 'block'; // Show copy button
    } else {
      resultDiv.textContent = "Error: No response.";
    }
  });
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
  if (popup.style.display === 'block' && !popup.contains(e.target) && e.target !== header) {
    popup.style.display = 'none';
  }
});
