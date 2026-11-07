import rateLimit from "express-rate-limit";

// Limits repeated requests from the same IP address.
// Allows 100 requests every 15 minutes for general API usage.
// Returns 429 when the limit is exceeded.
const RateLimitingMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please try again later.",
  },
});

// Limits login attempts to protect user accounts from password guessing.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

// Limits public container tracking requests to 10 per IP address each minute.
const publicTrackingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many tracking requests. Please try again in one minute.",
  },
});

export { loginRateLimit, publicTrackingRateLimit, RateLimitingMiddleware };
