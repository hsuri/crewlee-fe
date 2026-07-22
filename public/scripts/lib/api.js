// Authenticated fetch wrapper. `getToken` is called on every request (not
// captured once) so it always reflects the current session, not whatever it
// was when the client was created.
export function createApiClient(getToken) {
  return async function api(url, options = {}) {
    // A FormData body (file uploads) must NOT get a manual Content-Type -- the browser sets
    // its own multipart boundary, and overriding it here would break parsing on the backend.
    const isFormData = options.body instanceof FormData;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.error || 'Something went wrong');
    return data;
  };
}
