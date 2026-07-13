# Character Turnaround Reference Layout Design

## Goal

Replace the step 3 character asset layout with a production-friendly character turnaround reference image. Apply the same layout to character extraction output and character image generation, removing the old 2x2 character suffix entirely.

## Layout

Character reference images use a pure white background and one vertically structured composition:

- Top third: one front-facing close-up portrait showing the character's face clearly.
- Bottom two thirds: three equal-width vertical panels showing the same character from the neck down to the feet.
- Bottom panels appear in front, side, and back order.
- Bottom panels contain no head or facial features.
- Arms hang naturally, both feet remain fully visible, panel proportions match, and spacing is clear.
- The portrait and all three body views depict the same character, clothing, style, lighting, body proportions, and identity details.
- No subtitles, watermarks, logos, numbering, labels, panel titles, or extra text appear in the image.

## Extraction Output

Update both occurrences of the character `图片的结构` field in the step 3 extraction template: the required character output format and its example. Remove all old 2x2, four-grid, quadrant, and English layout instructions from the character extraction rules.

Scene and prop extraction formats remain unchanged.

## Character Image Generation

Replace the hard-coded `2x2` character image suffix in `Workspace` with the same turnaround layout constraints. The generated image prompt continues to prioritize the extracted character description, visual style, identity, clothing design, and original-face requirements.

Only character generation receives the new suffix. Scene and prop generation prompts remain unchanged.

## Testing

- Update template tests to require the new top-third and bottom-three-panel structure and reject the old 2x2 character layout.
- Update character image prompt tests to require the turnaround suffix and reject `2x2`, `FULL BODY NECK DOWN`, and quadrant instructions.
- Run focused tests, the complete test suite, and the production build.

## Scope

- Modify `src/domain/templates.ts` and `src/domain/templates.test.ts` for extraction output.
- Modify `src/components/Workspace.tsx` and relevant `Workspace.test.tsx` assertions for character image generation.
- Do not change scene, prop, storyboard, custom-image, or asset-library behavior.
