# AI Provider Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace QuickPick-based AI provider configuration with an in-Webview modal that configures HTTP AI providers using protocol-inferred endpoint paths.

**Architecture:** Extend the shared RPC settings model with HTTP protocol, API host, and write-only API key update support. Add a focused Webview modal component and route Settings menu `Configure AI Provider` to open it. Replace the single OpenAI-compatible HTTP implementation with a protocol-aware provider used by existing commit message generation and testing.

**Tech Stack:** TypeScript, React, Vitest, VS Code Extension API Secret Storage, fetch-based HTTP provider.

---

## File Structure

- Modify `packages/shared/src/rpc/contract.ts`: add `HttpAiProviderProtocol`, HTTP AI settings fields, and optional API key update shape.
- Regenerate `packages/extension/src/backend/rpc/contract.ts` and `packages/webview/src/app/rpcContract.generated.d.ts`.
- Modify `packages/extension/src/state/SettingsService.ts`: remove AI QuickPick dependencies, store optional API key from `settings.update`, and expose protocol/host/model.
- Modify `packages/extension/src/backend/git/OpenAICompatibleCommitMessageProvider.ts`: make it protocol-aware while preserving the existing class name for a small diff.
- Modify `packages/extension/src/backend/git/CommitMessageAiService.ts`: pass protocol and host to the HTTP provider.
- Add `packages/webview/src/components/AiProviderPanel/AiProviderPanel.tsx`: modal component similar to Remote Manager.
- Add `packages/webview/src/components/AiProviderPanel/AiProviderPanel.test.tsx`: component behavior tests.
- Modify `packages/webview/src/app/App.tsx`: open panel from Settings menu, post `settings.update`, and keep `settings.testAiProvider`.
- Modify existing unit tests for settings, provider, service, handlers, and App.
- Modify `packages/extension/package.json`: add protocol configuration property and update AI configuration descriptions.
- Modify `packages/extension/src/extension/activate.ts`: stop injecting AI QuickPick/InputBox into SettingsService.

## Tasks

### Task 1: Shared Settings Contract

- [ ] Write failing contract and settings service tests for `ai.openAICompatible.protocol`, `baseUrl` as API host, and optional `apiKey`.
- [ ] Run targeted tests and confirm they fail because fields are missing.
- [ ] Update shared RPC contract and extension package configuration.
- [ ] Regenerate RPC contracts.
- [ ] Run targeted tests and confirm they pass.

### Task 2: Secret-Aware Settings Updates

- [ ] Write failing `SettingsService` tests that `settings.update` stores a provided API key and preserves the stored key when no key is provided.
- [ ] Remove QuickPick/InputBox AI configuration from `SettingsService`.
- [ ] Update RPC handlers so `settings.configureAiProvider` is no longer used by the Webview path.
- [ ] Run targeted settings and handler tests.

### Task 3: Protocol-Aware HTTP Provider

- [ ] Write failing provider tests for Chat Completions, Responses, and Claude request URLs, headers, request bodies, and response parsing.
- [ ] Implement protocol-aware request building in `OpenAICompatibleCommitMessageProvider`.
- [ ] Update `CommitMessageAiService` tests to pass protocol and host.
- [ ] Run provider and AI service tests.

### Task 4: Webview AI Provider Panel

- [ ] Add failing `AiProviderPanel` tests for rendering protocol choices, host/model/API key fields, request preview, save, test, and close.
- [ ] Implement `AiProviderPanel`.
- [ ] Add failing `App` tests that Settings menu opens the panel and save posts `settings.update` with write-only API key.
- [ ] Wire `App` to open the panel and post settings updates; keep `Test AI Provider` available from the panel and settings menu.
- [ ] Run Webview component and App tests.

### Task 5: Final Verification

- [ ] Run `pnpm rpc:check`.
- [ ] Run targeted extension tests.
- [ ] Run targeted webview tests.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test` if targeted verification is clean.
