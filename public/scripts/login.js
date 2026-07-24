import { getSession, setSession } from './lib/session.js';

const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const errorDiv = document.getElementById('loginError');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirmPassword');
const heading = document.getElementById('loginHeading');
const subtext = document.getElementById('loginSubtext');
const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');

if (getSession()) {
  window.location.href = '/app';
}

// mode is 'login' or 'signup' while on the tabs; 'setPassword' is a sub-state entered once we
// know (via signup's invite-status check, or login's `pending` fallback below) that the account
// has no password yet -- the Log in / Sign up tabs stay visible throughout so it's always one
// click to go back to either top-level mode.
let mode = new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'login';

function setActiveTab(tab) {
  tabLogin.classList.toggle('active', tab === 'login');
  tabSignup.classList.toggle('active', tab === 'signup');
}

function enterSignupMode() {
  mode = 'signup';
  setActiveTab('signup');
  emailInput.value = '';
  emailInput.readOnly = false;
  passwordInput.classList.add('hidden');
  passwordInput.required = false;
  passwordInput.value = '';
  confirmInput.classList.add('hidden');
  confirmInput.required = false;
  confirmInput.value = '';
  heading.textContent = 'Sign up';
  subtext.textContent = "Enter the email your manager or admin used to invite you.";
  submitBtn.textContent = 'Continue';
  errorDiv.classList.add('hidden');
  emailInput.focus();
}

function enterSetPasswordMode(email) {
  mode = 'setPassword';
  setActiveTab('signup');
  emailInput.value = email;
  emailInput.readOnly = true;
  passwordInput.classList.remove('hidden');
  passwordInput.required = true;
  passwordInput.value = '';
  passwordInput.placeholder = 'Choose a password (min 8 characters)';
  confirmInput.classList.remove('hidden');
  confirmInput.required = true;
  heading.textContent = 'Create your password';
  subtext.textContent = `Finish setting up ${email}.`;
  submitBtn.textContent = 'Create Password';
  errorDiv.classList.add('hidden');
  passwordInput.focus();
}

function enterLoginMode() {
  mode = 'login';
  setActiveTab('login');
  emailInput.readOnly = false;
  passwordInput.classList.remove('hidden');
  passwordInput.required = true;
  passwordInput.value = '';
  passwordInput.placeholder = 'Password';
  confirmInput.value = '';
  confirmInput.classList.add('hidden');
  confirmInput.required = false;
  heading.textContent = 'Sign in';
  subtext.textContent = "Access your restaurant's workspace.";
  submitBtn.textContent = 'Sign In';
  errorDiv.classList.add('hidden');
}

if (mode === 'signup') enterSignupMode();
else setActiveTab('login');

tabLogin.addEventListener('click', enterLoginMode);
tabSignup.addEventListener('click', enterSignupMode);

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
    } else if (mode === 'signup') {
      submitBtn.textContent = 'Checking...';
      const email = emailInput.value.trim();
      const res = await fetch(`/api/auth/invite-status?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Something went wrong');

      if (data.status === 'pending') {
        enterSetPasswordMode(email);
      } else if (data.status === 'active') {
        enterLoginMode();
        emailInput.value = email;
        subtext.textContent = 'This account is already set up — enter your password to log in.';
        passwordInput.focus();
      } else {
        throw new Error("We couldn't find an invite for that email. Ask your manager or admin to add you first.");
      }
      submitBtn.disabled = false;
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
    submitBtn.textContent = mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Continue' : 'Create Password';
  }
});
