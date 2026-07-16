import { getSession, setSession } from './lib/session.js';

const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const errorDiv = document.getElementById('loginError');

if (getSession()) {
  window.location.href = '/app';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';
  errorDiv.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Invalid email or password');

    setSession(data);
    window.location.href = '/app';
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});
