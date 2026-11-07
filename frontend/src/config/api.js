import axios from "axios";
import { getStoredToken } from "./authStorage.js";

// Create one Axios client for requests to the backend API.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5127/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Attach the saved JWT to protected requests using the backend's Bearer format.
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  const isPublicRequest =
    config.url === "/users/login" || config.url?.startsWith("/containers/track");

  if (token && !isPublicRequest) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
