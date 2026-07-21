// Relies on the `.toast-stack` / `.toast` / `.toast.success` / `.toast.error` rules defined in
// the page's own stylesheet (currently only app.css) — this module has no CSS of its own.
// All toasts append into one bottom-right flex-column stack (created lazily, once) instead of
// each being independently `position: fixed` at the same spot, so two toasts firing close
// together stack legibly instead of rendering exactly on top of each other.
function getStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.append(stack);
  }
  return stack;
}

export function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  getStack().append(el);
  setTimeout(() => el.remove(), 3800);
}
