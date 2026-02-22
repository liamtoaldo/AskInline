// 1. Create the Context Menus
// Text Selection
browser.contextMenus.create({
  id: "ask-gemini-selection",
  title: "💫 AskInline about selection",
  contexts: ["selection"]
});

// Image
browser.contextMenus.create({
  id: "ask-gemini-image",
  title: "🖼️ AskInline about this image",
  contexts: ["image"]
});

// Editable (Inputs, Textareas)
browser.contextMenus.create({
  id: "ask-gemini-fill",
  title: "✨ AskInline to write here",
  contexts: ["editable"]
});

// 2. Handle Right-Click
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ask-gemini-selection" || info.menuItemId === "ask-gemini-image") {
    browser.tabs.sendMessage(tab.id, {
      action: "openPopup",
      selectionText: info.selectionText, // Will be undefined for simple image click
      imageSrc: info.srcUrl,
      mediaType: info.mediaType
    }).catch(err => {
      console.warn("Could not send message to content script. Ensure the page is refreshed.", err);
    });
  } else if (info.menuItemId === "ask-gemini-fill") {
    browser.tabs.sendMessage(tab.id, {
      action: "composeInline"
    }).catch(err => {
      console.warn("Could not send message to content script. Ensure the page is refreshed.", err);
    });
  }
});

// Helper: Fetch image and convert to Base64
async function urlToBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Result is "data:image/jpeg;base64,...", we need just the base64 part
      const base64data = reader.result.split(',')[1];
      const mimeType = reader.result.split(',')[0].split(':')[1].split(';')[0];
      resolve({ data: base64data, mimeType: mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 3. Handle the Gemini API Call
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "askAI") {

    // Retrieve settings
    browser.storage.sync.get(["apiKey", "model"]).then(async (result) => {
      const apiKey = result.apiKey;
      const model = result.model || "gemini-2.5-flash-lite";

      if (!apiKey) {
        sendResponse({ answer: "Error: API Key is missing. Please set it in the extension options." });
        return;
      }

      try {
        let contents = [];

        // 1. Initial Prompt (System Context + First Question)
        // If history exists, the first item is the context setup. 
        // We need to reconstruct the conversation for Gemini.

        let systemParts = [];

        if (request.imageSrc) {
          const imageData = await urlToBase64(request.imageSrc);
          systemParts.push({
            inline_data: {
              mime_type: imageData.mimeType,
              data: imageData.data
            }
          });
        }

        // Add text context
        if (request.context) {
          systemParts.push({ text: `Context: "${request.context}"` });
        }

        // 2. Build History
        if (request.history && request.history.length > 0) {
          // First message must include the system parts + the first user prompt
          let firstUserMsg = request.history[0];
          let firstParts = [...systemParts, { text: firstUserMsg.text }];

          contents.push({ role: "user", parts: firstParts });

          // Add the rest
          for (let i = 1; i < request.history.length; i++) {
            contents.push({
              role: request.history[i].role,
              parts: [{ text: request.history[i].text }]
            });
          }

          // Add current prompt if it's not already in history (it usually isn't)
          if (request.prompt) {
            contents.push({ role: "user", parts: [{ text: request.prompt }] });
          }

        } else {
          // No history (First run)
          let parts = [...systemParts];
          if (request.prompt) parts.push({ text: request.prompt });
          else parts.push({ text: "Analyze this." }); // Fallback

          contents.push({ role: "user", parts: parts });
        }

        // Call Google Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ contents: contents })
        });

        const data = await response.json();

        // Check for errors
        if (data.error) {
          sendResponse({ answer: "Error: " + data.error.message });
          return;
        }

        // Parse Gemini response structure
        if (data.candidates && data.candidates.length > 0) {
          const text = data.candidates[0].content.parts[0].text;
          sendResponse({ answer: text });
        } else {
          sendResponse({ answer: "No response from Gemini." });
        }

      } catch (error) {
        sendResponse({ answer: "Error processing request: " + error.message });
      }

    });

    return true; // Keep channel open for async response
  }
});
