# AskInline

AskInline is a Firefox extension that integrates Google's Gemini AI directly into your browser context menu. It allows you to select text on any webpage and instantly query Gemini about it—whether you need a definition, a translation, or a summary—without opening a new tab or breaking your flow.

![AskInline Screenshot](https://via.placeholder.com/800x400.png?text=AskInline+Demo+Placeholder)

## Why?

Switching tabs to ask an LLM a quick question is a friction point. AskInline solves this by bringing the model to the text. It's built with **Manifest V3** and **Vanilla JS**, keeping it extremely lightweight (no build steps, no heavy frameworks).

## Features

- **Contextual Analysis**: Right-click any selection to "AskInline".
- **Draggable UI**: The result pops up in a non-intrusive, movable modal.
- **Markdown Support**: Responses are rendered with proper formatting (bold, code blocks, lists).
- **Model Selection**: Switch between `Gemini 2.5 Flash`, `Pro`, or `Lite` depending on your speed/cost needs.
- **Privacy**: Your API Key is stored locally in your browser (`browser.storage.sync`) and is never sent to any third-party server other than Google's API directly.

## Installation

1.  Clone this repository:
    ```bash
    git clone https://github.com/yourusername/askinline.git
    ```
2.  Open Firefox and navigate to `about:debugging`.
3.  Click **"This Firefox"** > **"Load Temporary Add-on"**.
4.  Select the `manifest.json` file from the cloned folder.

## Configuration

1.  Get your API Key from [Google AI Studio](https://aistudio.google.com/).
2.  Open the extension settings (formatted as a standard browser options page).
3.  Paste your key and select your preferred model.
4.  Save.

## Roadmap

- [ ] Image analysis support (right-click on images).
- [ ] "Pin" mode for the modal.
- [ ] Chat history within the session.

## License

MIT
