function getStoredSessionToken() {
  try {
    const raw = localStorage.getItem('leadflow-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || parsed?.token || null;
  } catch {
    return null;
  }
}

const originalFetch = globalThis.fetch.bind(globalThis);

export function installAuthFetchInterceptor() {
  if ((globalThis as typeof globalThis & { __leadflowAuthPatched?: boolean }).__leadflowAuthPatched) {
    return;
  }

  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers || {});
    const token = getStoredSessionToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-session-token', token);
    }

    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return originalFetch(input, { ...init, headers });
  };

  (globalThis as typeof globalThis & { __leadflowAuthPatched?: boolean }).__leadflowAuthPatched = true;
}

installAuthFetchInterceptor();

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const token = getStoredSessionToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-session-token', token);
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return globalThis.fetch(input, { ...init, headers });
}
