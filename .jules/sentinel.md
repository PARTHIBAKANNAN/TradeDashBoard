## 2024-07-24 - Avoid hardcoded fallback secrets for session management
**Vulnerability:** A hardcoded, predictable string ("dev-insecure-change-me") was used as the fallback value for `SESSION_SECRET` in `backend/app/config.py`.
**Learning:** If the environment variable is not explicitly set in a production environment, the application will silently fall back to using this known, insecure string. This would allow an attacker to forge session cookies, potentially bypassing authentication and gaining unauthorized access.
**Prevention:** Always use a secure, randomly generated string as a fallback for sensitive keys (e.g., `secrets.token_urlsafe(32)` in Python) to ensure that even if the configuration is missed, the resulting key is unique and unguessable for that application instance.
