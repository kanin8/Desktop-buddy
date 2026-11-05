// The buddy's controls: the hover pill (Chat, To-do, More) and the More menu
// (To-do, Settings, Snooze). Handles showing/hiding, the accent highlight for
// the active function, menu placement and keyboard use. Knows nothing about
// chat or the main process: every action comes in as a callback.

// Sets up the controls and returns the functions the overlay uses to drive
// them.
// - elements: { avatar, pill, chatButton, todoButton, moreButton, menu }
// - getFrogRect(): the visible frog's rectangle, used to place the menu
// - actions: { onChat, onTodo, onSettings, onSnooze(choice), onHidden }
//   onHidden runs every time the pill hides, however it was closed.
function createBuddyControls(elements, getFrogRect, actions) {
  const { avatar, pill, chatButton, todoButton, moreButton, menu } = elements;
  const { pillHideDelayMs } = window.CONTROLS_CONFIG;
  const snoozeItem = menu.querySelector('[data-action="snooze"]');
  const snoozeChoices = menu.querySelector('.snooze-choices');

  let hideTimer = null;
  // Opened with the keyboard shortcut: stays until Escape or a click elsewhere,
  // instead of hiding when the pointer isn't on the frog.
  let isPinned = false;

  const isPillVisible = () => pill.classList.contains('is-visible');
  const isMenuOpen = () => menu.classList.contains('is-open');

  function cancelHide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function showPill() {
    cancelHide();
    pill.classList.add('is-visible');
    // The indicator fades out while the pill takes its place.
    avatar.classList.add('is-pill-visible');
  }

  function hidePill() {
    cancelHide();
    closeMenu();
    isPinned = false;
    pill.classList.remove('is-visible');
    avatar.classList.remove('is-pill-visible');
    actions.onHidden();
  }

  // Hides the pill after a short delay, unless shouldStayOpen() says otherwise
  // by then. An already running timer is left alone rather than restarted, so
  // calling this repeatedly can't postpone the hide forever.
  function hidePillSoon(shouldStayOpen) {
    if (hideTimer || isPinned || !isPillVisible()) return;
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!shouldStayOpen()) hidePill();
    }, pillHideDelayMs);
  }

  // Opens the pill from the keyboard shortcut, with focus on Chat.
  function openPinned() {
    showPill();
    isPinned = true;
    chatButton.focus();
  }

  // Highlights Chat in the accent colour while the chat panel is open.
  function setChatActive(isActive) {
    chatButton.classList.toggle('is-active', isActive);
    chatButton.setAttribute('aria-pressed', String(isActive));
  }

  // Highlights To-do in the accent colour while the to-do panel is open.
  function setTodoActive(isActive) {
    todoButton.classList.toggle('is-active', isActive);
    todoButton.setAttribute('aria-pressed', String(isActive));
  }

  // --- MORE MENU ---

  function openMenu({ focusFirstItem = false } = {}) {
    menu.classList.add('is-open');
    moreButton.classList.add('is-active');
    moreButton.setAttribute('aria-expanded', 'true');
    positionMenu();
    if (focusFirstItem) getMenuItems()[0].focus();
  }

  function closeMenu() {
    if (!isMenuOpen()) return;
    setSnoozeChoicesOpen(false);
    menu.classList.remove('is-open');
    moreButton.classList.remove('is-active');
    moreButton.setAttribute('aria-expanded', 'false');
  }

  function setSnoozeChoicesOpen(isOpen) {
    snoozeChoices.hidden = !isOpen;
    snoozeItem.setAttribute('aria-expanded', String(isOpen));
    if (isMenuOpen()) positionMenu();
  }

  // The menu items that can currently be reached (hidden snooze choices are
  // skipped), in on-screen order.
  function getMenuItems() {
    return [...menu.querySelectorAll('.menu-item')].filter((item) => item.offsetParent !== null);
  }

  // Places the menu beside the frog with its bottom level with the top of the
  // pill: to the right if it fits, otherwise to the left, always on screen.
  function positionMenu() {
    if (!isMenuOpen()) return;

    const frog = getFrogRect();
    const pillRect = pill.getBoundingClientRect();
    const margin = getScreenMargin();
    const gap = readLengthToken('--space-2');
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;

    let left = frog.right + gap;
    if (left + width > window.innerWidth - margin) left = frog.left - gap - width;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const top = Math.max(margin, pillRect.top - height);

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  // Moves focus up or down the menu, wrapping at the ends.
  function moveMenuFocus(step) {
    const items = getMenuItems();
    const index = items.indexOf(document.activeElement);
    const next = (index + step + items.length) % items.length;
    items[next].focus();
  }

  // Closes the innermost open level for Escape. Returns false when nothing in
  // the controls was open, so the overlay can close the next thing out.
  function handleEscape() {
    if (isMenuOpen() && !snoozeChoices.hidden) {
      setSnoozeChoicesOpen(false);
      snoozeItem.focus();
      return true;
    }
    if (isMenuOpen()) {
      closeMenu();
      moreButton.focus();
      return true;
    }
    return false;
  }

  // --- EVENTS ---

  chatButton.addEventListener('click', () => {
    closeMenu();
    actions.onChat();
  });

  todoButton.addEventListener('click', () => {
    closeMenu();
    actions.onTodo();
  });

  // event.detail is 0 for keyboard "clicks" (Enter/Space): only then does
  // focus jump into the menu, so mouse users aren't affected.
  moreButton.addEventListener('click', (event) => {
    if (isMenuOpen()) closeMenu();
    else openMenu({ focusFirstItem: event.detail === 0 });
  });

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('.menu-item');
    if (!item) return;

    const snoozeChoice = item.dataset.snooze;
    if (snoozeChoice) {
      hidePill();
      actions.onSnooze(snoozeChoice);
      return;
    }

    switch (item.dataset.action) {
      case 'todo':
        closeMenu();
        actions.onTodo();
        break;
      case 'settings':
        closeMenu();
        actions.onSettings();
        break;
      case 'snooze': {
        const willOpen = snoozeChoices.hidden;
        setSnoozeChoicesOpen(willOpen);
        if (willOpen && event.detail === 0) snoozeChoices.querySelector('.menu-item').focus();
        break;
      }
    }
  });

  // Arrow keys inside the menu: up/down between items, right opens the snooze
  // choices, left goes back to "Snooze".
  menu.addEventListener('keydown', (event) => {
    const isInSnoozeChoices = snoozeChoices.contains(document.activeElement);

    if (event.key === 'ArrowDown') moveMenuFocus(1);
    else if (event.key === 'ArrowUp') moveMenuFocus(-1);
    else if (event.key === 'ArrowRight' && document.activeElement === snoozeItem) {
      setSnoozeChoicesOpen(true);
      snoozeChoices.querySelector('.menu-item').focus();
    } else if (event.key === 'ArrowLeft' && isInSnoozeChoices) {
      setSnoozeChoicesOpen(false);
      snoozeItem.focus();
    } else return;

    event.preventDefault();
  });

  return {
    isPillVisible,
    isMenuOpen,
    isPinned: () => isPinned,
    showPill,
    hidePill,
    hidePillSoon,
    openPinned,
    closeMenu,
    setChatActive,
    setTodoActive,
    positionMenu,
    handleEscape,
  };
}
