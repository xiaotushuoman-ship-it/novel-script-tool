# Adaptive Short-Drama Script Generation Design

## Goal

Upgrade step 1, `一键小说正文生成`, so it produces complete, shootable short-drama scripts from an outline. Keep the existing total-chapter and per-chapter word-count controls, but make story logic and dialogue adapt to the detected genre instead of relying on a single urban-commercial formula.

## Genre Adaptation

Before drafting, the model internally identifies the dominant genre from the outline and selected style. It selects the matching dramatic engine without showing this analysis in the result.

- Urban power fantasy: use concrete interests, identity reversals, information gaps, professional pressure, and earned counterattacks.
- Female-oriented romance: use relationship choices, emotional stakes, misunderstandings with evidence, boundaries, and emotional reversals.
- Costume intrigue: use faction goals, hidden information, alliances, strategic choices, and consequences that follow from earlier setups.
- Costume romance: use social constraints, personal choices, trust, status pressure, and emotional progression.
- Other genres: preserve the source premise and derive a fitting conflict, reversal, and dialogue register from it.

The model must not force contracts, folk-commercial disputes, modern slang, or urban settings into stories whose genre does not support them.

## Output Contract

Keep the existing controls for `totalChapters`, `chapterWords`, `style`, `perspective`, and `autoContinue`. The output contains only the usable script:

1. A compact production specification with the selected chapter count, chapter word target, genre-appropriate setting, covered chapters, and serial/completed state.
2. Consecutive chapter scripts, each using scene title, visual action, natural dialogue, and sound/atmosphere cues.
3. A first spoken or narrated line that immediately presents a genre-appropriate conflict, reversal, threat, desire, or unusual event.
4. A concrete, shootable chapter-end hook.

Internal quality, retention, originality, continuity, and compliance checks remain mandatory but must not be printed. The result must not include self-ratings, viral-score explanations, prompt workflow narration, genre analysis, or compliance notes.

## Safety And Style

Use short, natural dialogue appropriate to the detected time period and genre. Avoid formulaic slogans, unsupported character actions, exploitative humiliation, graphic violence, sexualized material, real public figures, and group stereotyping. When an outline includes unsafe material, retain its dramatic function through a safer, filmable conflict without explaining the replacement.

## Scope

- Modify only the step 1 template in `src/domain/templates.ts`.
- Update `src/domain/templates.test.ts` with assertions for genre adaptation, script-only output, hidden internal checks, and unchanged word-count controls.
- Do not change steps 2 or 10, the UI fields, or generation transport.

## Verification

Run the focused template tests, the full test suite, and the production build after implementation.
