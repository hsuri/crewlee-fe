// Relies on the `.toast` / `.toast.success` / `.toast.error` rules defined in
// the page's own stylesheet (currently only app.css) — this module has no CSS
// of its own.
export function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 3800);
}
