// Authenticated fetch wrapper. `getToken` is called on every request (not
// captured once) so it always reflects the current session, not whatever it
// was when the client was created.
export function createApiClient(getToken) {
  return async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.error || 'Something went wrong');
    return data;
  };
}
