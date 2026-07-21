// Custom confirm/prompt modals so destructive/naming actions match the rest of the app's visual
// language instead of dropping into a browser-native confirm()/prompt() dialog. Both inject one
// .modal-backdrop/.modal (the same classes every other modal in app.css already uses) and resolve
// a Promise instead of blocking the thread the way window.confirm/prompt do.

function openDialog(innerHtml) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal dialog-modal">${innerHtml}</div>`;
  document.body.append(backdrop);
  return backdrop;
}

function closeDialog(backdrop) {
  backdrop.remove();
  document.dispatchEvent(new CustomEvent('dialog-closed'));
}

export function confirmDialog(message, { danger = false, confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const backdrop = openDialog(`
      <p class="dialog-message">${message}</p>
      <div class="modal-actions">
        <button type="button" class="button secondary" data-role="cancel">${cancelLabel}</button>
        <button type="button" class="button ${danger ? 'danger' : ''}" data-role="confirm">${confirmLabel}</button>
      </div>
    `);
    const finish = (result) => { closeDialog(backdrop); resolve(result); };
    backdrop.querySelector('[data-role="cancel"]').addEventListener('click', () => finish(false));
    backdrop.querySelector('[data-role="confirm"]').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
    backdrop.querySelector('[data-role="confirm"]').focus();
  });
}

export function promptDialog(label, defaultValue = '') {
  return new Promise((resolve) => {
    const backdrop = openDialog(`
      <label class="field full"><span>${label}</span><input type="text" data-role="value" value="${defaultValue}" /></label>
      <div class="modal-actions">
        <button type="button" class="button secondary" data-role="cancel">Cancel</button>
        <button type="button" class="button" data-role="confirm">Save</button>
      </div>
    `);
    const input = backdrop.querySelector('[data-role="value"]');
    const finish = (result) => { closeDialog(backdrop); resolve(result); };
    backdrop.querySelector('[data-role="cancel"]').addEventListener('click', () => finish(null));
    backdrop.querySelector('[data-role="confirm"]').addEventListener('click', () => finish(input.value.trim() || null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim() || null); } });
    input.focus();
    input.select();
  });
}
