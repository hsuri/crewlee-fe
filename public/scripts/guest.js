import { publicApi } from './lib/api.js';

// /guest/{slug} -- the slug is the only routing info this page has; everything else
// (restaurant name, whether Guest AI is even on) comes from the backend, which resolves it
// server-side. There is no session, no token, no restaurant id anywhere in this page.
const slug = location.pathname.split('/').filter(Boolean)[1] || '';

const SUGGESTED_PROMPTS = [
  'Are the fries gluten-free?',
  'Does the Caesar dressing contain dairy?',
  'Which dishes are vegetarian?',
  'Does this contain peanuts?',
];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const threadEl = document.getElementById('guestThread');
const formEl = document.getElementById('guestAskForm');
const inputEl = document.getElementById('guestQuestion');
const nameEl = document.getElementById('guestRestaurantName');

let thread = [];

function renderUnavailable(message) {
  nameEl.textContent = 'Guest AI';
  threadEl.innerHTML = `<div class="guest-empty">
      <div class="glyph">🍽️</div>
      <h2>Not available right now</h2>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

function renderThread() {
  if (!thread.length) {
    threadEl.innerHTML = `<div class="guest-empty">
        <div class="glyph">👋</div>
        <h2>Hi! Ask me about the menu</h2>
        <p>Ingredients, allergens, dietary restrictions, and preparation -- I'll answer using information this restaurant has provided.</p>
        <div class="guest-prompt-chips">${SUGGESTED_PROMPTS.map(p => `<button type="button" class="guest-prompt-chip" data-prompt="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')}</div>
      </div>`;
    threadEl.querySelectorAll('[data-prompt]').forEach(btn => btn.addEventListener('click', () => askQuestion(btn.dataset.prompt)));
    return;
  }
  threadEl.innerHTML = thread.map(m => {
    const q = `<div class="guest-msg-row q"><div class="guest-msg q">${escapeHtml(m.question)}</div></div>`;
    let a;
    if (m.pending) {
      a = `<div class="guest-msg-row a"><div class="guest-msg a"><div class="guest-typing"><span></span><span></span><span></span></div></div></div>`;
    } else if (m.error) {
      a = `<div class="guest-msg-row a"><div class="guest-msg a error">${escapeHtml(m.error)}</div></div>`;
    } else {
      a = `<div class="guest-msg-row a"><div class="guest-msg a">${escapeHtml(m.answer)}</div></div>`;
    }
    return q + a;
  }).join('');
  threadEl.scrollTop = threadEl.scrollHeight;
}

async function askQuestion(question) {
  question = (question || '').trim();
  if (!question) return;
  inputEl.value = '';
  thread.push({ question, pending: true });
  renderThread();
  const sendBtn = formEl.querySelector('button[type="submit"]');
  sendBtn.disabled = true;
  const entry = thread[thread.length - 1];
  try {
    const result = await publicApi(`/api/guest/${encodeURIComponent(slug)}/query`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
    entry.pending = false;
    entry.answer = result.answer;
  } catch (error) {
    entry.pending = false;
    entry.error = error.message === 'Too many questions -- please wait a moment and try again'
      ? error.message
      : "Sorry, I couldn't get an answer just now. Please try again in a moment.";
  }
  sendBtn.disabled = false;
  renderThread();
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  askQuestion(inputEl.value);
});

async function init() {
  if (!slug) {
    renderUnavailable("We couldn't find this restaurant's Guest AI page.");
    return;
  }
  try {
    const info = await publicApi(`/api/guest/${encodeURIComponent(slug)}`);
    nameEl.textContent = info.restaurantName;
    if (!info.enabled) {
      renderUnavailable('This restaurant hasn’t turned on Guest AI yet. Please ask your server for help with menu or allergen questions.');
      return;
    }
    formEl.classList.remove('hidden');
    thread = [];
    renderThread();
  } catch (error) {
    renderUnavailable("We couldn't find this restaurant's Guest AI page. Please check the QR code or ask your server.");
  }
}

init();
