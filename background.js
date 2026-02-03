// background.js

// API_KEY is now loaded from config.js


// 1. Create the Context Menu
browser.contextMenus.create({
  id: "ask-gemini-context",
  title: "Ask Gemini about selection",
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

    // Construct the prompt
    const fullPrompt = `Context: "${request.context}"\n\nQuestion: ${request.prompt}\n\nPlease keep the answer concise and relevant.`;

    // Call Google Gemini API (Using Gemini 1.5 Flash for speed)
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`, {
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
        // data.candidates[0].content.parts[0].text
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

    return true; // Keep channel open for async response
  }
});
