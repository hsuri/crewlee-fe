// Session storage helpers shared by login.html, app.html, and admin.html.
// Two independent keys: `crewleeSession` (staff login, {token, user}) and
// `adminToken` (waitlist admin panel, a raw password-as-token string).

const SESSION_KEY = 'crewleeSession';
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
