# UI Spec – Desktop Study Buddy

Owner: UI design (Kristin's branch)
Status: Draft v1 – to be revised during iteration
Built with: Electron

---

## Rules for Claude Code

- Always plan first and show the plan before editing any files. Wait for approval.
- Build one step at a time (see Build order). Do not start the next step until the current one is tested and committed.
- All colours, blur, opacity, corner radius, spacing and fonts live in ONE theme file as named variables. Never hardcode style values in components.
- Any text the buddy shows the user must follow `docs/voice-and-behaviour.md`.
- Do not edit components owned by other group members without asking first (e.g. the to-do component).
- Comment the code so non-programmers in the group can follow it.

---

## Design principles

1. **Quiet presence.** At rest, only the frog is visible. Controls appear when needed.
2. **Low effort to start.** Proactive messages offer one-tap answers; typing is optional.
3. **The user stays in control.** The user can always snooze the buddy, and can always quit it fully from settings.
4. **Readable everywhere.** The buddy floats over any background (white documents, busy wallpapers), so text must stay readable on all of them.

---

## Visual style (starting point – expected to change)

Direction: dark navy frosted glass with colourful accents.

| Token | Starting value | Notes |
|---|---|---|
| `--surface` | navy, ~80% opacity | Glass panels. Keep opacity high enough for readability |
| `--surface-blur` | ~16px | Only if blurring behind the window works in Electron on our OS – check first. Fallback: solid navy |
| `--text-primary` | near-white | |
| `--text-secondary` | light grey | Must still pass contrast on `--surface` |
| `--accent` | teal | Primary buttons, active states |
| `--accent-text` | dark navy | Text/icons ON accent buttons (white on light teal fails contrast) |
| `--radius` | large, rounded | Matches the soft, friendly frog |
| `--font` | one sans-serif | |

Accessibility checks for every step:
- Text and icons meet WCAG AA contrast (4.5:1 for text).
- Test on a white background AND a busy wallpaper.
- Everything reachable by keyboard, not only by hover.

---

## States

### 1. Idle
- Only the frog sprite, sitting at its laptop, bottom-right of the screen.
- A small subtle indicator (oval/handle) shows that something can expand on hover.

### 2. Hover
- Hovering the frog reveals a small pill with two buttons: **Chat** and **More (…)**.
- Pill disappears shortly after the mouse leaves.
- Keyboard shortcut opens the same controls (shortcut TBD).

### 3. Menu (More …)
- Small glass panel with:
  - To-do
  - Settings
  - Snooze → 30 min / 1 hour / until tomorrow
- No "Close buddy" here. Full quit lives in Settings.
- The active function is highlighted in the pill (accent colour).

### 4. Chat
- Text input sits **below** the frog ("Start new chat…" + send button).
- Message history stacks **upward** from the frog, in a narrow column on the right side of the screen.
  - Newest message: closest to the frog, fully visible.
  - Older messages: fade the further up they are.
  - On hover/scroll, the history becomes fully visible (fading must not make anything unreadable when the user is actually looking at it).
- User and buddy messages are visually distinct.

### 5. Proactive message (nudge)
- Before speaking, the frog's sprite changes (e.g. looks up or waves) so the message doesn't appear abruptly.
- The buddy's message appears in the same history column, closest to the frog.
- Quick-reply buttons: **"Yes, help me!"** (accent) and **"Not now"** (secondary).
- The message can be dismissed without answering, and fades out after a while if ignored (timing TBD).
- Wording must follow `docs/voice-and-behaviour.md` – avoid diagnosing the user ("you seem stuck").

### 6. To-do overview
- Styles the existing to-do component (built by another group member) using the theme file.
- Coordinate with that group member before editing.

### If time
- First-launch flow: short tutorial + data consent (coordinate with the group member responsible for GDPR/privacy).
- Settings panel, including full quit.
- Light mode (should only require a second set of theme values).

---

## Build order

| Step | What | Done when |
|---|---|---|
| 1 | Theme file | All tokens defined, nothing hardcoded elsewhere |
| 2 | Idle + hover indicator | Frog shows, indicator visible |
| 3 | Hover pill + menu with snooze | Menu opens/closes, snooze hides the buddy for the chosen time |
| 4 | Chat input + fading history | Can send a message and scroll back through earlier ones |
| 5 | Proactive message + quick replies + sprite change | Message appears after sprite cue, both buttons work, can be dismissed |
| 6 | To-do styling | Existing component uses theme tokens |

One Claude Code session and one commit per step. Screenshot before/after for the logbook.

---

## Open questions

- Can Electron blur what's behind the overlay window on our OS? (Ask Claude Code in plan mode before step 1.)
- Exact keyboard shortcut for opening the controls.
- How long ignored proactive messages stay before fading.
- Where exactly the frog sits if the user has a dock/taskbar on the right.
