import rateLimit from 'express-rate-limit';

/**
 * Rate limit for event submission — 60 requests/minute per IP.
 * Coaches submit events, so this is generous enough for live games.
 */
export const eventSubmitRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before submitting more events.',
    },
  },
});

/**
 * Rate limit for API key generation — 10 requests/minute per IP.
 * Prevents bulk key creation abuse.
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many API key requests. Please wait before trying again.',
    },
  },
});
