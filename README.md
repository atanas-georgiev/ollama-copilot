# Ollama Copilot Extension

This is a VSCode extension that provides local AI-powered code completion using Ollama.

## Features

- Inline code completion
- Chat with Ollama
- Configurable Ollama API URL and model

## Installation

1. Install Ollama on your system
2. Start the Ollama service
3. Install this extension in VSCode

## Configuration

The extension can be configured through VSCode settings:
- `ollamaCopilot.baseUrl`: The base URL of the Ollama API (default: http://localhost:11434)
- `ollamaCopilot.autocompleteModel`: The model to use for code autocomplete (default: qwen2.5-coder:1.5b)
- `ollamaCopilot.chatModel`: The model to use for chat (default: qwen3-coder:30b)

## Usage

1. Press F5 to start debugging this extension (or install via `.vsix`)
2. In the VSCode window:
   - **Inline completion**: starts automatically as you type
   - **Open Chat**: Press `Ctrl+Shift+P` (Command Palette) → type "Ollama: chat" → press Enter

## Development

To develop this extension:

1. Install dependencies: `npm install`
2. Compile TypeScript: `npm run compile`
3. Press F5 to debug
