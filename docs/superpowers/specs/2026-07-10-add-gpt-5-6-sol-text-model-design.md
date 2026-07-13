# Add `gpt-5.6-sol` Text Model

## Goal

Add `gpt-5.6-sol` as a selectable text reasoning model across all text-generation features while keeping `gpt-5.5` as the default model.

## Design

The application already routes all text-generation features through the shared `AiSettings.model` value and exposes that value through one model selector in `SettingsDialog`. Add `gpt-5.6-sol` to the shared text model option list so every text feature can select it without duplicating configuration.

The AI client already forwards third-party model identifiers unchanged. The existing per-model API key source mapping uses the selected model identifier as its key, so `gpt-5.6-sol` automatically supports the current primary, secondary, and Claude group selection behavior.

## Scope

- Add `gpt-5.6-sol` to the text model dropdown.
- Keep `gpt-5.5` as the default model.
- Preserve existing API endpoint and per-model API key group behavior.
- Do not change image model lists or image fallback settings.

## Testing

Add a `SettingsDialog` test that verifies `gpt-5.6-sol` appears in the text model selector and that `gpt-5.5` remains selected by default. Run the focused test, full test suite, and production build.
