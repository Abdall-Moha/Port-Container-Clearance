import { useEffect, useState } from "react";
import api from "../config/api.js";
import AuthContext from "./authContext.js";
import {
  clearStoredSession,
  getStoredToken,
  getStoredUser,
  saveStoredSession,
} from "../config/authStorage.js";

// Keep only the backend profile fields needed by the shared dashboard layout.
function getSafeUser(user) {
  const id = user?.id || user?._id;
  if (!id || !user?.fullName || !user?.role) {
    throw new Error("The server did not return the required user profile.");
  }

  return {
    id: String(id),
    fullName: user.fullName,
    role: user.role,
  };
}

// Share and restore the signed-in user and JWT across the React application.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(() => Boolean(getStoredToken()));

  // Verify a saved JWT with the real backend and refresh the safe user profile.
  useEffect(() => {
    const savedToken = getStoredToken();
    if (!savedToken) {
      return undefined;
    }

    let isMounted = true;

    async function restoreSession() {
      try {
        const response = await api.get("/users/me");
        const safeUser = getSafeUser(response.data?.user);

        if (isMounted) {
          setToken(savedToken);
          setUser(safeUser);
          saveStoredSession(savedToken, safeUser);
        }
      } catch (error) {
        // Invalid and expired credentials should not remain in browser storage.
        if (error.response?.status === 401 || error.response?.status === 403) {
          clearStoredSession();
          if (isMounted) {
            setToken(null);
            setUser(null);
          }
        } else if (isMounted && !getStoredUser()) {
          setToken(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Save the JWT and minimal user profile after the login endpoint succeeds.
  function signIn(loginResponse) {
    const nextToken = loginResponse?.token;
    if (typeof nextToken !== "string" || !nextToken) {
      throw new Error("The server did not return an authentication token.");
    }

    const safeUser = getSafeUser(loginResponse.user);
    saveStoredSession(nextToken, safeUser);
    setToken(nextToken);
    setUser(safeUser);
    setIsLoading(false);
  }

  // Clear the browser session and reset the shared authenticated user.
  function signOut() {
    clearStoredSession();
    setToken(null);
    setUser(null);
    setIsLoading(false);
  }

  const value = {
    token,
    user,
    isAuthenticated: Boolean(token && user),
    isLoading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

