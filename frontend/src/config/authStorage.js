export const AUTH_TOKEN_KEY = "port-clearance-token";
export const AUTH_USER_KEY = "port-clearance-user";

// Read the saved bearer token for authenticated API requests.
export function getStoredToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

// Save only the JWT and the small user profile needed by the interface.
export function saveStoredSession(token, user) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

// Remove all authentication information when the user signs out.
export function clearStoredSession() {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  } catch {
    // The in-memory session is still cleared if browser storage is unavailable.
  }
}

// Restore the minimal user profile that was saved after a successful login.
export function getStoredUser() {
  try {
    const savedUser = window.localStorage.getItem(AUTH_USER_KEY);
    if (!savedUser) return null;

    const user = JSON.parse(savedUser);
    return user && user.id && user.fullName && user.role
      ? { id: user.id, fullName: user.fullName, role: user.role }
      : null;
  } catch {
    return null;
  }
}
