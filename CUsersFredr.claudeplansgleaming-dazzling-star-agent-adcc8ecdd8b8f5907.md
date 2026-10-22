# Implementation Plan: Configurable AI Detection Server

This plan details the changes required to allow users to configure the AI detection server from the Electron settings menu, replacing hardcoded configurations and endpoints.

## 1. Data Structure
The configuration will be stored as a JSON object:

```json
{
  "aiServer": {
    "endpoint": "http://localhost:3000",
    "provider": "ollama",
    "apiKey": "",
    "model": "gemma:2b"
  }
}
```

## 2. Electron App Changes

### `preload.js`
- Add new API methods to `electronAPI`:
    - `getAIConfig()`: `ipcRenderer.invoke('ai-config:get')`
    - `setAIConfig(config)`: `ipcRenderer.invoke('ai-config:set', config)`

### `main.js`
- Implement IPC handlers for `ai-config:get` and `ai-config:set`.
- Use `app.getPath('userData')` to read/write `settings.json`.
- In `ai-config:set`, after saving to `settings.json`, send the updated config to the AI server's `/config` endpoint using `fetch` or `axios`.

### `settings.html`
- Add a new `<div class="section">` for "AI Configuration".
- Include:
    - A dropdown (`<select>`) for Provider (Ollama, Anthropic, OpenAI).
    - Text inputs for API Key, Model Name, and Server Endpoint.
    - A "Save" button.

### `settings.js`
- Implement logic to:
    - Load current AI config on startup via `window.electronAPI.getAIConfig()`.
    - Populate the UI fields.
    - Handle the "Save" button click by calling `window.electronAPI.setAIConfig(newConfig)`.

### `src/features/activity-detection/ipc/handlers.js`
- Modify `ActivityIPCHandlers` to:
    - Store the `aiEndpoint` (initialized from `settings.json` or a default).
    - Update `aiClassify(info)` to use `this.aiEndpoint` instead of the hardcoded `http://localhost:3000`.
    - Add a method `updateConfig(config)` to update the endpoint dynamically.

## 3. AI Server Changes (`ai-server/index.js`)

### Configuration Persistence
- Create a `config.json` file in the server directory to persist settings.
- Replace the static `AI_CONFIG` with a variable that is loaded from `config.json` on startup, falling back to `.env` or defaults.

### New Endpoint
- Implement a `POST /config` endpoint:
    - Accepts the configuration object.
    - Updates the in-memory `AI_CONFIG`.
    - Writes the updated config to `config.json`.

## 4. Step-by-Step Implementation Sequence

1. **AI Server Setup**:
    - Add `config.json` loading/saving logic.
    - Implement `POST /config`.
    - Verify the server can be updated via CURL.

2. **Electron Backend**:
    - Update `main.js` with `settings.json` management and IPC handlers.
    - Update `preload.js` to expose the new API.
    - Update `ActivityIPCHandlers` to use the dynamic endpoint.

3. **Electron UI**:
    - Add HTML elements to `settings.html`.
    - Implement the JS logic in `settings.js`.

## 5. Verification Plan

- **AI Server Update**: Use a tool like Postman or CURL to send a POST to `/config` and verify `config.json` updates and the server uses the new provider.
- **Settings UI**: Open the settings menu, change the endpoint/provider, save, and verify the values persist after restarting the Electron app.
- **End-to-End Flow**: 
    - Change the AI server endpoint in settings.
    - Trigger an activity that requires AI classification.
    - Verify the request goes to the new endpoint.
- **Persistence**: Restart both AI server and Electron app and ensure settings are restored.
