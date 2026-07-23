// Session storage helpers shared by login.html, app.html, and admin.html.
// Three independent keys: `crewleeSession` (staff login, {token, user}),
// `crewleeAccounts` (sibling restaurant accounts for the same login -- see below), and
// `adminToken` (waitlist admin panel, a raw password-as-token string).

const SESSION_KEY = 'crewleeSession';
// Populated only when a login matched more than one restaurant account for the same
// email+password (see POST /api/auth/login's `accounts` response) -- an array of every
// {token, user} the login call already authenticated, so app.html can offer an instant
// "switch restaurant" control without asking the person to log in again.
const ACCOUNTS_KEY = 'crewleeAccounts';
const ADMIN_TOKEN_KEY = 'adminToken';

export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ACCOUNTS_KEY);
}

export function getAccounts() {
  const raw = sessionStorage.getItem(ACCOUNTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function setAccounts(accounts) {
  sessionStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getAdminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}
