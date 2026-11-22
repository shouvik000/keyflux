
import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

// Attach the authentication token to protected API requests.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("keyflux_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Handle expired or invalid authentication.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("keyflux_token");
    }

    return Promise.reject(error);
  }
);

export default api;
