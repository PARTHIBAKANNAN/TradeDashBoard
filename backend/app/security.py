"""
Dashboard access control — a small, pluggable auth layer.

Credentials are verified by Supabase Auth on the frontend (email/password against
the user's own Supabase project). This module only verifies the resulting session
JWT and manages our own session cookie, which keeps the SSE stream (native
EventSource can't send an Authorization header) working unchanged.
"""

from . import config, supabase_auth


def login_required() -> bool:
    """The gate is active only when Supabase is configured (off in dev)."""
    return bool(config.SUPABASE_URL)


def authenticate(access_token: str) -> str | None:
    """Verify a Supabase session JWT; return the user's email if valid, else None."""
    if not login_required():
        return "dev"
    claims = supabase_auth.verify_token(access_token)
    return claims.get("email") if claims else None


def is_authenticated(request) -> bool:
    """True if the request carries a valid login session (or the gate is disabled)."""
    if not login_required():
        return True
    return bool(request.session.get("user"))


# Paths reachable without a dashboard login session.
def is_public_path(path: str) -> bool:
    if path in ("/api/health", "/api/auth/login", "/login", "/callback"):
        return True
    # Vite build assets + favicon needed to render the login page itself.
    if path.startswith("/assets/") or path in ("/favicon.ico", "/index.html", "/"):
        return True
    return False
