import { getSession, setSession } from './lib/session.js';

const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const errorDiv = document.getElementById('loginError');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirmPassword');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const heading = document.getElementById('loginHeading');
const subtext = document.getElementById('loginSubtext');
const hint = document.getElementById('loginHint');

if (getSession()) {
  window.location.href = '/app';
}

// mode is 'login' until the backend tells us this email has no password set yet (the
// `pending` flag on a failed /api/auth/login) -- then we switch this same page into a
// self-serve "choose your password" form rather than a separate route/page.
let mode = 'login';

function enterSetPasswordMode(email) {
  mode = 'setPassword';
  emailInput.value = email;
  emailInput.readOnly = true;
  passwordInput.value = '';
  passwordInput.placeholder = 'Choose a password (min 8 characters)';
  confirmInput.classList.remove('hidden');
  confirmInput.required = true;
  backToLoginBtn.classList.remove('hidden');
  heading.textContent = 'Create your password';
  subtext.textContent = `Finish setting up ${email}.`;
  submitBtn.textContent = 'Create Password';
  hint.classList.add('hidden');
  errorDiv.classList.add('hidden');
  passwordInput.focus();
}

function enterLoginMode() {
  mode = 'login';
  emailInput.readOnly = false;
  passwordInput.value = '';
  passwordInput.placeholder = 'Password';
  confirmInput.value = '';
  confirmInput.classList.add('hidden');
  confirmInput.required = false;
  backToLoginBtn.classList.add('hidden');
  heading.textContent = 'Sign in';
  subtext.textContent = "Access your restaurant's workspace.";
  submitBtn.textContent = 'Sign In';
  hint.classList.remove('hidden');
  errorDiv.classList.add('hidden');
}

backToLoginBtn.addEventListener('click', enterLoginMode);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  errorDiv.classList.add('hidden');

  try {
    if (mode === 'login') {
      submitBtn.textContent = 'Signing in...';
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.pending) {
          enterSetPasswordMode(emailInput.value);
          submitBtn.disabled = false;
          return;
        }
        throw new Error(data.detail || 'Invalid email or password');
      }
      setSession(data);
      window.location.href = '/app';
    } else {
      submitBtn.textContent = 'Creating...';
      if (passwordInput.value !== confirmInput.value) {
        throw new Error('Passwords do not match');
      }
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not set password');
      setSession(data);
      window.location.href = '/app';
    }
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Password';
  }
});
