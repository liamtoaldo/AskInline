// 1. Create the Context Menu
browser.contextMenus.create({
  id: "ask-gemini-context",
  title: "💫 AskInline about selection",
  contexts: ["selection"]
});

// 2. Handle Right-Click
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ask-gemini-context") {
    browser.tabs.sendMessage(tab.id, {
      action: "openPopup",
      selectionText: info.selectionText
    });
  }
});

// 3. Handle the Gemini API Call
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "askAI") {

    // Retrieve settings
    browser.storage.sync.get(["apiKey", "model"]).then((result) => {
      const apiKey = result.apiKey;
      const model = result.model || "gemini-2.5-flash-lite";

      if (!apiKey) {
        sendResponse({ answer: "Error: API Key is missing. Please set it in the extension options." });
        return;
      }

      // Construct the prompt
      const fullPrompt = `Context: "${request.context}"\n\nQuestion: ${request.prompt}\n\nPlease keep the answer concise and relevant.`;

      // Call Google Gemini API
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: fullPrompt
            }]
          }]
        })
      })
        .then(response => response.json())
        .then(data => {
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
        })
        .catch(error => {
          sendResponse({ answer: "Network Error: " + error.message });
        });
    });

    return true; // Keep channel open for async response
  }
});
