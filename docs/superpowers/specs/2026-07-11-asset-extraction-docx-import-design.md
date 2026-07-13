# Asset Extraction DOCX Import Design

## Goal

Add `.docx` document import to the source-text field in step 3, `剧本资产提取`, without changing document import behavior in other workflow steps.

## Parsing

Use the browser build of `mammoth` to extract raw text from the DOCX `ArrayBuffer`. Parsing happens locally in the browser; the document is not uploaded to another service.

The importer preserves paragraph separation as plain text. Embedded images, page layout, headers, footers, comments, tracked changes, tables as visual layouts, fonts, and other Word styling are not imported. Only readable text is placed into the step 3 source field.

## File Routing

- Step 3 accepts the existing text formats plus `.docx` and the DOCX MIME type.
- Existing text formats continue through the current `File.text()` / `FileReader.readAsText()` path.
- DOCX files use `File.arrayBuffer()` with a `FileReader.readAsArrayBuffer()` fallback, then pass the buffer to `mammoth.extractRawText`.
- Other workflow steps keep their current accepted file extensions and text-only parsing behavior.
- Legacy binary `.doc` files remain unsupported.

## Error Handling

If DOCX parsing fails or produces no readable text, show a clear import failure status. Do not replace the current source field content on failure. A successful import writes the extracted text and shows the existing imported-file confirmation.

## UI

The step 3 import control advertises DOCX support in its accepted extensions and helper text. No new buttons or dialogs are added.

## Testing

- Verify step 3 accepts `.docx` while another document-import step does not.
- Verify a DOCX file is parsed and its extracted text is written into the asset source field.
- Verify failed or empty DOCX parsing keeps the existing field value and shows an error.
- Verify existing TXT import still works.
- Run focused tests, the full suite, and the production build.

## Scope

- Add `mammoth` as a runtime dependency.
- Modify the document import routing in `src/components/Workspace.tsx` and its tests.
- Preserve the currently pending step 1 and character-layout changes.
- Do not modify asset extraction prompts, image generation, or document import controls in other steps.
