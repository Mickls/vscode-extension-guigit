# AI Provider Panel Design

## Goal

Replace the AI provider QuickPick/InputBox configuration flow with an in-Webview modal panel similar to Remote Manager.

## User Experience

The Settings menu opens a `Configure AI Provider` modal inside the existing GUI Git History Webview. The panel exposes HTTP API configuration only for now because VS Code Language Model access is not available for testing.

The panel lets users choose one HTTP protocol:

- OpenAI Chat Completions compatible.
- OpenAI Responses API.
- Anthropic Claude Messages API.

Users enter only an API host such as `https://api.openai.com` or `https://api.anthropic.com`. They do not enter endpoint paths. The panel shows a request preview so users can see the inferred endpoint. Users also enter a model and optionally enter a replacement API key. Leaving the API key empty preserves any stored key.

## Data Model

AI settings add an HTTP protocol field and rename the stored URL concept from endpoint base URL to API host while preserving compatibility with the existing configuration key where practical.

The Webview may send a write-only API key in an update request. The backend stores the key in VS Code Secret Storage and never returns it in settings responses.

## Backend Behavior

The backend chooses the request shape from the selected protocol:

- Chat Completions compatible: `POST {host}/v1/chat/completions` with `Authorization: Bearer`.
- Responses API: `POST {host}/v1/responses` with `Authorization: Bearer`.
- Claude Messages API: `POST {host}/v1/messages` with `x-api-key` and `anthropic-version`.

The configured provider is tested and used by commit message generation through the same service path as the current OpenAI-compatible provider.

## Testing

Add unit tests for:

- Webview modal rendering and save/test actions.
- SettingsService updating protocol, host, model, and optional secret.
- HTTP provider request shapes for all three protocols.
- CommitMessageAiService passing protocol-specific settings to the HTTP provider.
