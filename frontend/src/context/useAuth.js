import { useContext } from "react";
import AuthContext from "./authContext.js";

// Read shared authentication state from a component.
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}

export default useAuth;
