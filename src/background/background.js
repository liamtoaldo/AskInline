// background.js — AskInline Background Script

// 1. Create the Context Menus
// Text Selection
browser.contextMenus.create({
  id: "ask-gemini-selection",
  title: "AskInline about selection",
  contexts: ["selection"]
});

// Image
browser.contextMenus.create({
  id: "ask-gemini-image",
  title: "AskInline about this image",
  contexts: ["image"]
});

// Editable (Inputs, Textareas)
browser.contextMenus.create({
  id: "ask-gemini-fill",
  title: "AskInline to write here",
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

// 3. Keyboard Shortcut
browser.commands.onCommand.addListener((command) => {
  if (command === "ask-inline-shortcut") {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: "shortcutTriggered"
        }).catch(err => {
          console.warn("AskInline: Could not trigger shortcut on this page.", err);
        });
      }
    });
  }
});

// 4. Onboarding — First Install
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Check if API key is already set (unlikely on first install)
    browser.storage.sync.get(["apiKey"]).then(result => {
      if (!result.apiKey) {
        browser.runtime.openOptionsPage();
      }
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

// 5. Handle the Gemini API Call via Port-based Streaming
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "askAI-stream") return;

  port.onMessage.addListener(async (request) => {
    // Retrieve settings
    let result;
    try {
      result = await browser.storage.sync.get(["apiKey", "model", "defaultLanguage"]);
    } catch (e) {
      port.postMessage({ error: "Error reading settings: " + e.message });
      return;
    }

    const apiKey = result.apiKey;
    const model = result.model || "gemini-2.5-flash-lite";
    const defaultLanguage = result.defaultLanguage || "";

    if (!apiKey) {
      port.postMessage({ error: "Error: API Key is missing. Please set it in the extension options." });
      return;
    }

    try {
      let contents = [];
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

      if (request.context) {
        systemParts.push({ text: `Context: "${request.context}"` });
      }

      // System Instructions
      let systemPrompt = "Use Markdown formatting. Use **bold** for key terms. Do not overdo it. Keep lists clean.\n";

      if (defaultLanguage) {
        systemPrompt += `Detect the language of the 'Context' (or the user input if empty). If you cannot detect it, answer strictly in ${defaultLanguage}. Do NOT mention the language detected, just start the answer immediately.\n`;
      } else {
        systemPrompt += `Detect the language of the 'Context' (or the user input if empty). Answer strictly in that language. Do NOT mention the language detected, just start the answer immediately.\n`;
      }

      if (request.requestType === "fill") {
        systemPrompt += `You are a writing assistant. The user wants text generated for a form field. Provide ONLY the requested text, without quotes, introductions, or extra commentary. Match the tone and context of the request.`;
      } else if (request.requestType === "image") {
        systemPrompt += `You are a visual analysis assistant. The user right-clicked an image and wants a detailed description or analysis. Describe what you see clearly and thoroughly.`;
      } else {
        systemPrompt += `You are a helpful assistant. The user selected text on a webpage and wants an explanation or answer related to it. Be concise (~80-100 words) but comprehensive.`;
      }

      // Determine fallback prompt if input is empty
      let promptText = request.prompt;
      if (!promptText) {
        if (request.requestType === "fill") promptText = "Generate the requested text.";
        else if (request.requestType === "image") promptText = "Analyze this image.";
        else promptText = "Explain the context.";
      }

      // Build History
      if (request.history && request.history.length > 0) {
        let firstUserMsg = request.history[0];
        let firstParts = [...systemParts, { text: firstUserMsg.text || "Explain" }];
        contents.push({ role: "user", parts: firstParts });

        for (let i = 1; i < request.history.length; i++) {
          contents.push({
            role: request.history[i].role,
            parts: [{ text: request.history[i].text }]
          });
        }

        if (promptText) {
          contents.push({ role: "user", parts: [{ text: promptText }] });
        }
      } else {
        let parts = [...systemParts];
        parts.push({ text: promptText });
        contents.push({ role: "user", parts: parts });
      }

      // Build request body
      const requestBody = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: contents
      };

      // Use streamGenerateContent with SSE
      const controller = new AbortController();
      const signal = controller.signal;

      const onDisconnectAbortion = () => {
        controller.abort("User clicked stop");
      };
      port.onDisconnect.addListener(onDisconnectAbortion);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: signal
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
        port.postMessage({ error: "Error: " + errorMsg });
        return;
      }

      // Stream SSE response using ReadableStream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Normalize \r\n to \n
        buffer = buffer.replace(/\r\n/g, "\n");

        // Process complete SSE events (separated by double newlines)
        const events = buffer.split("\n\n");
        buffer = events.pop(); // Keep incomplete last chunk in buffer

        for (const event of events) {
          const lines = event.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const data = JSON.parse(jsonStr);
                if (data.candidates && data.candidates.length > 0) {
                  const parts = data.candidates[0].content?.parts;
                  if (parts && parts.length > 0 && parts[0].text) {
                    const chunk = parts[0].text;
                    fullText += chunk;
                    try {
                      port.postMessage({ chunk: chunk });
                    } catch (postErr) {
                      console.warn("AskInline: Port disconnected during streaming", postErr);
                      return;
                    }
                  }
                }
              } catch (parseErr) {
                console.warn("AskInline: Failed to parse SSE chunk:", jsonStr, parseErr);
              }
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.replace(/\r\n/g, "\n").split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.candidates && data.candidates.length > 0) {
                const parts = data.candidates[0].content?.parts;
                if (parts && parts.length > 0 && parts[0].text) {
                  fullText += parts[0].text;
                  try { port.postMessage({ chunk: parts[0].text }); } catch (e) { return; }
                }
              }
            } catch (e) { }
          }
        }
      }

      // Send completion signal
      if (fullText) {
        port.postMessage({ done: true, fullText: fullText });
      } else {
        port.postMessage({ error: "No response from Gemini." });
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        // Stream was stopped by user
        return;
      }

      console.error("AskInline streaming error:", error);
      try {
        port.postMessage({ error: "Error processing request: " + error.message });
      } catch (e) {
        // Port already disconnected
      }
    } finally {
      port.onDisconnect.removeListener(onDisconnectAbortion);
    }
  });
});
