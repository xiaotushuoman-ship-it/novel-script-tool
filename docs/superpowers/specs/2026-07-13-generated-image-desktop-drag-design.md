# Generated Image Desktop Drag Design

## Goal

Allow generated images in steps 3, 6, and 9 to be dragged directly to the computer desktop as real PNG files. Preserve the existing click-to-preview, right-click download, and drag-to-ZZDH behavior.

## Scope

The shared generated-image result panel covers:

- Step 3 asset extraction image results.
- Step 6 storyboard image results.
- Step 9 custom reference-image results.
- The thumbnail in each result card.
- The full-size image inside the preview dialog.

Asset-library images, reference-image upload cards, videos, and the image-generation API are unchanged.

## Drag Data

Each generated image drag exposes two compatible payloads:

- The existing `application/x-xiaotu-asset-image` payload for ZZDH image slots.
- Browser and operating-system drag data for saving a real PNG file on the desktop.

Remote HTTP image results continue to use their source URL. Inline `data:image/...;base64,...` results receive a reusable Blob object URL before the user starts dragging. The `DownloadURL`, `text/uri-list`, and fallback text values reference the downloadable URL and filename instead of a filename-only placeholder.

## Performance And Lifecycle

Large base64 images must not be decoded during `dragstart`. Blob URLs are prepared outside the drag event and reused by both the thumbnail and preview image.

Object URLs are revoked when their image result is deleted, when its result collection is cleared or replaced, and when the workspace unmounts. Preview close must not revoke a drag URL that is still owned by an active image result.

If Blob preparation fails, the image remains clickable and downloadable through the existing controls. The internal ZZDH drag payload remains available, and the UI does not freeze.

## User Interface

No new panel or button is required. Update the image tooltip to state that the image can be dragged to the desktop or to a ZZDH image slot. The preview image is marked draggable and uses the same drag handler and filename as its source result card.

## Testing

- Verify HTTP image results expose a desktop-download URL and preserve the ZZDH payload.
- Verify base64 image results use a Blob object URL rather than the original large data URL during drag.
- Verify `dragstart` does not call base64 decoding for an already prepared image.
- Verify the preview-dialog image is draggable with the same filename and payload.
- Verify deleting and clearing image results revoke owned object URLs without breaking unrelated previews.
- Run focused `Workspace` tests, the full test suite, and the production build.
