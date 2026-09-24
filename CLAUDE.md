# Project: Desktop Focus Avatar

## What this is
A desktop avatar/companion app that helps users stay focused on their work
(e.g. nudges, timers, mood/state feedback, idle detection). Team project —
multiple people will touch this code, so consistency matters more than
personal style preference.

## Tech stack
<!-- Fill in / edit to match your actual stack -->
- Language: JavaScript / TypeScript
- Framework: Electron (or Tauri) for desktop shell
- Rendering: HTML/CSS/Canvas for the avatar
- State management: (fill in)
- Package manager: (npm / pnpm / yarn)

## Code style & conventions

### General
- Prefer clarity over cleverness. Optimize for a teammate reading this in
  6 months, not for fewest lines.
- Keep functions small and single-purpose. If a function needs a comment
  explaining "and then it also does X", split it.
- Use descriptive names (`isUserIdle`, not `flag1`).
- No dead code, no commented-out blocks left in commits — delete it,
  git history remembers it for us.

### Comments
- Every file starts with a 1–2 line comment explaining what it's responsible for.
- Comment the *why*, not the *what*, for non-obvious logic (e.g. "// using
  a 500ms debounce here because the OS idle event fires in bursts").
- Every function that isn't trivially self-explanatory gets a short comment
  above it describing its purpose, inputs, and side effects.
- Comment CSS sections (see below) — don't leave raw style blocks unexplained.

### CSS
- Structure stylesheets in clearly labeled sections, in this order:
  1. Variables / theme tokens (colors, spacing, fonts)
  2. Reset / base styles
  3. Layout containers
  4. Components (one section per component, alphabetical or by UI hierarchy)
  5. Animations / transitions
  6. States (`.is-active`, `.is-dragging`, etc.)
- Use a section header comment before each block:
```css
  /* ============================
     Avatar — idle animation states
     ============================ */
```
- One selector's rules per block, each property on its own line, no inline
  styles in JS/TS unless dynamically computed.
- Use CSS custom properties (`--avatar-size`, `--accent-color`) instead of
  magic numbers/hex codes scattered through the file.
- Group related properties together (positioning → box model → typography →
  visual → animation).
- Avoid `!important`; if you think you need it, flag it in a comment
  explaining why.

### File organization
- One component = one folder with its own JS/TS, CSS, and (if needed) assets.
- Shared/reusable styles go in a `styles/shared/` or `styles/tokens.css`,
  not duplicated per component.
- Keep avatar "personality"/behavior logic separate from rendering logic
  (e.g. `avatarState.ts` vs `avatarRender.ts`) so either can change without
  touching the other.

## Commits & PRs
- Small, focused commits with clear messages (`fix: avatar flickers on
  idle transition`, not `updates`).
- No unrelated changes bundled into one commit.

## Testing
<!-- fill in your actual test setup -->
- (e.g. Run `npm test` before pushing; add a test for new state transitions)

## Things to avoid
- Don't hardcode timing values / thresholds — put them in a config/constants
  file so they're tunable in one place.
- Don't couple avatar animation logic directly to OS-specific APIs; wrap
  platform calls behind an interface so the app stays portable.
- Don't introduce new dependencies without a quick note in the PR on why
  it's needed.

## Notes for Claude specifically
- When generating or editing CSS, always follow the section structure and
  commenting rules above — don't just append new rules at the end of a file.
- When editing existing code, match the surrounding style rather than
  introducing a new pattern, even if you'd personally prefer something else.
- Ask before adding new dependencies or restructuring folders.