import axios from "axios";

// Create one Axios client for requests to the backend API.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5127/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

export default api;
