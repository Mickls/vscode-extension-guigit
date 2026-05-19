# AI Commit Message Diff Window Design

## Goal

Improve AI-generated commit messages by sending the actual staged text diff when it fits within an internal character budget, summarizing oversized diffs before final generation, and excluding binary patch content from AI prompts.

## Behavior

`commitMessage.generate` continues to generate a single editable conventional commit message for staged changes only. The backend now builds richer context from staged changes:

- staged file paths and status from `git diff --cached --name-status`;
- diff summary from `git diff --cached --stat`;
- text file patch content from `git diff --cached --no-ext-diff -- <text files>`;
- binary file names from `git diff --cached --numstat`, without binary patch content.

When the text diff prompt fits inside the configured character window, the service sends one final generation request containing the full text diff plus binary-file metadata.

When the text diff prompt exceeds the window, the service splits the text diff into character-bounded chunks, asks the configured AI provider for factual summaries of each chunk, then sends a final generation request containing the summaries, file metadata, stat output, and binary-file metadata.

## Custom Prompt Rules

Custom commit-message prompt rules define the final output shape. They apply only to the final commit-message generation prompt.

Chunk summary prompts use an internal fixed instruction that asks for factual, concise summaries of code changes. They must not include or replace user custom rules. This preserves user expectations: a custom prompt such as "write in Chinese" or "always use `fix:`" still controls the final commit message.

Default commit-message rules remain the fallback when custom prompt mode is disabled.

## Binary Files

The service treats staged files whose `git diff --cached --numstat` added and deleted counts are both `-` as binary. Binary files are excluded from text diff commands and are represented in the prompt as a list of paths under a binary-files section.

The service does not attempt to read or encode binary file contents.

## Windowing

The window is an internal character threshold. Character count is sufficient because git diffs rarely exceed model context limits in normal use, and this keeps the implementation deterministic without adding tokenizer dependencies.

The threshold is a private service constant. It can be adjusted later without changing RPC contracts or settings UI.

## Architecture

The feature stays inside `CommitMessageAiService`. The Webview and RPC contract remain unchanged because the backend owns Git diff preparation and AI prompt construction.

The provider interface remains unchanged: providers still receive a single prompt string and return one message string. Oversized diff summarization is orchestrated by `CommitMessageAiService` using repeated calls to the same selected provider.

## Error Handling

Existing provider errors continue to surface through the current RPC error path.

If there are staged binary changes but no staged text diff, the final prompt still includes file status, stat output, and binary file names so the model can produce a relevant message.

## Testing

Add backend unit tests for:

- full text diff is included when under the character window;
- binary files are listed but excluded from text diff commands;
- oversized text diffs are summarized in chunks before final generation;
- custom prompt rules apply to the final generation prompt and not to chunk summary prompts;
- OpenAI-compatible and VS Code language model paths both use the same prompt-building behavior through the existing provider selection logic.
