## 2024-05-14 - [Critical] Unprotected OAuth Callback Endpoint
**Vulnerability:** The OAuth `/callback` endpoint for the FYERS API login flow lacked authentication checks.
**Learning:** Even though the UI button to trigger the OAuth flow might be protected, the callback URL itself must always be protected if it performs state-mutating actions (like saving a global token for the application).
**Prevention:** Always apply the `require_login` dependency (or equivalent authentication middleware) to all routes that handle sensitive configuration or tokens, including OAuth callback routes.