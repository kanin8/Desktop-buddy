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

Direction: neutral dark grey glass with a teal accent.

| Token | Starting value | Notes |
|---|---|---|
| `--surface` | dark grey `#1c1c1e`, 90% opacity | Glass panels, with a thin light edge and a soft shadow. Keep opacity high enough for readability |
| (no blur) | – | Electron can't blur the desktop behind a full-screen see-through window, so there is no blur token |
| `--text-primary` | near-white `#ededed` | About 10.8:1 on `--surface` over a white page (worst case) |
| `--text-secondary` | light grey `#b8b8b8` | About 6.4:1 on `--surface`, 4.7:1 on a hovered menu row. Lighter than the mock-up's placeholder grey, which would fail AA |
| `--accent` | teal | Primary buttons, active states |
| `--accent-text` | dark teal | Text/icons ON accent buttons, 7.2:1 (white on light teal fails contrast) |
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
- The user can drag the frog anywhere on the screen. The position is remembered between launches (it falls back to bottom-right if it no longer fits, e.g. on a smaller screen).
- Clicking and hovering still work normally: a drag only starts after the pointer moves a few pixels with the button held.

### 2. Hover
- Hovering the frog reveals a small pill with two buttons: **Chat** and **More (…)**. The pill appears in the indicator's place under the frog's feet, so the indicator "expands" into it.
- The pill replaces the earlier "Ask the buddy" option; Chat opens the same AI chat.
- Pill disappears shortly after the mouse leaves (400 ms), but stays while the chat or menu is open.
- Keyboard shortcut opens the same controls: **Control + Option + B** on macOS, **Ctrl + Alt + B** on Windows/Linux (set in `config.js`). Cmd+Option+B was avoided because it is "bookmarks" in Safari and Chrome. Inside the controls: Tab between buttons, ↑/↓ in the menu, → / ← into and out of the snooze choices, Escape closes one level at a time.

### 3. Menu (More …)
- Small glass panel with:
  - To-do
  - Settings
  - Snooze → 30 min / 1 hour / until tomorrow ("until tomorrow" = 08:00 the next day, set in `config.js`). The tray's Start Avatar or the shortcut ends a snooze early. A snooze is not remembered if the app restarts.
- No "Close buddy" here. Full quit lives in Settings.
- The active function is highlighted in the pill (accent colour).

### 4. Chat
- Text input sits **below** the frog ("Start new chat…" + round teal send button), under the hover pill. The pill stays under the frog's feet so it doesn't jump away from the pointer right after clicking Chat.
- If there's no room below the frog (e.g. its default bottom-right spot), the frog slides up just enough while chatting and slides back when the chat closes. The lifted spot is never saved; dragging mid-chat keeps the drop spot.
- No title row. Close with the small × at the left of the input bar, the highlighted Chat button, or Escape.
- Message history stacks **upward** from the frog, in a narrow column (`--chat-width`).
  - Newest message: closest to the frog, fully visible.
  - Older messages: fade the further up they are (`--history-clear-height`, `--history-fade-height`, down to `--history-fade-min-opacity`).
  - On hover, keyboard focus or scroll, the history becomes fully visible (fading must not make anything unreadable when the user is actually looking at it). Faded text is below AA contrast on purpose for that reason; the newest messages always meet AA.
  - Near the top of the screen the history moves beside the frog (left if it fits, otherwise right), bottom level with the frog's feet.
- User and buddy messages are visually distinct: buddy on the left in the panel grey, user on the right with a teal tint, errors with a red tint.
- Keyboard: focus starts in the input; Tab goes input → send → history (arrow keys scroll it); Shift+Tab reaches ×.
- Styles: `chat/chat.css`; placement: `chat/chatLayout.js`; chat logic (sending, streaming, errors, tasks): `overlay.js` (Maike).

### 5. Proactive message (nudge)
- Before speaking, the frog's sprite changes so the message doesn't appear abruptly. For now this reuses the click reaction (`standingClicked`); swap in a "looks up" or "talking" sprite in `nudge/config.js` when the artists make one.
- The buddy's message appears in the history column's spot, closest to the frog (beside it near the top of the screen), as one bubble with a small × and quick-reply buttons.
- Quick-reply buttons: **"Yes, help me!"** (accent) and **"Not now"** (secondary). The buttons come from a list in `nudge/config.js`, so more can be added later (e.g. the level 3 routing).
  - Yes: opens the chat with the nudge and a follow-up line already in the history; focus in the input.
  - Not now: a short back-off line, then it fades (4 s).
- The message can be dismissed without answering (× or Escape), and fades out after 60 s if ignored. Hovering or focusing it pauses the timer.
- It never takes keyboard focus from the app the user is in; screen readers announce the text. **Control + Option + B** jumps to the replies while a nudge is showing.
- No nudge while the chat or menu is open. Opening the chat or menu, dragging the frog or snoozing closes a showing nudge.
- While the chat or a nudge is showing, the spelling/bedtime speech bubble sits above it instead of right above the frog.
- Wording must follow `docs/voice-and-behaviour.md` – avoid diagnosing the user ("you seem stuck"). The lines are in `nudge/config.js`.
- Nothing sends real nudges yet: the detection branch decides when (triggers, cooldowns) and sends `avatar-nudge` with the text. Try it with `npm start -- --test-nudge`.
- Files: `nudge/nudge.css`, `nudge/nudge.js`, `nudge/config.js`; placement shared with the chat in `chat/chatLayout.js`.

### 6. To-do overview
- Styles the existing to-do component (built by another group member) using the theme file.
- Coordinate with that group member before editing. Agreed with Maike: styles only. Her logic, markup and classes are unchanged.
- `toDoList/index.html` links `styles/tokens.css`; its own short variable names (`--ink`, `--muted`, `--panel`, …) now point at the theme tokens, and every other value in its styles uses a token.
- Always dark grey, like the buddy (the panel's own light version was removed). It is its own solid window, so it uses `--panel-bg` (no transparency). The window's colour before the page paints (`backgroundColor` in `toDoList/todoWindow.js`) must match `--grey-900`.
- Contrast on the panel grey: primary text 14.5:1, secondary 8.6:1, placeholder in the field 6.8:1, "Add" 7.2:1, the red delete × on hover 4.3:1 (icon, 3:1 needed).

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

- ~~Can Electron blur what's behind the overlay window on our OS?~~ Answered: no, not for one full-screen window. The theme uses no blur.
- ~~Exact keyboard shortcut for opening the controls.~~ Decided: Control + Option + B (see Hover).
- How long ignored proactive messages stay before fading. Starting value: 60 s (`nudge/config.js`), to test with users.
- A proper sprite cue before a nudge ("looks up" or "talking"); the click reaction stands in for now.
- Where exactly the frog sits if the user has a dock/taskbar on the right. (Partly solved: the user can drag the frog out of the way, and the spot is remembered.)
