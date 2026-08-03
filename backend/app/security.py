"""
Dashboard access control — a small, pluggable auth layer.

Credentials are verified by Supabase Auth on the frontend (email/password against
the user's own Supabase project). This module only verifies the resulting session
JWT and manages our own session cookie, which keeps the SSE stream (native
EventSource can't send an Authorization header) working unchanged.
"""

from fastapi import HTTPException, Request

from . import config, supabase_auth

# Fixed placeholder used to attribute paper-trading data to a single "user"
# when the login gate is disabled (dev / SUPABASE_URL unset).
DEV_USER_ID = "00000000-0000-0000-0000-000000000000"


def login_required() -> bool:
    """The gate is active only when Supabase is configured (off in dev)."""
    return bool(config.SUPABASE_URL)


def authenticate(access_token: str) -> dict | None:
    """Verify a Supabase session JWT; return {"email", "user_id"} if valid, else None."""
    if not login_required():
        return {"email": "dev", "user_id": DEV_USER_ID}
    claims = supabase_auth.verify_token(access_token)
    if not claims:
        return None
    return {"email": claims.get("email"), "user_id": claims.get("sub")}


def is_authenticated(request) -> bool:
    """True if the request carries a valid login session (or the gate is disabled)."""
    if not login_required():
        return True
    return bool(request.session.get("user"))


def require_login(request: Request):
    """FastAPI dependency: 401 unless the request carries a valid dashboard session."""
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="login required")


def current_user_id(request: Request) -> str:
    """The stable Supabase user id for this session, or the dev placeholder."""
    user = request.session.get("user")
    return user["user_id"] if user else DEV_USER_ID


# Paths reachable without a dashboard login session.
def is_public_path(path: str) -> bool:
    if path in ("/api/health", "/api/auth/login", "/login", "/callback"):
        return True
    # Vite build assets + favicon needed to render the login page itself.
    if path.startswith("/assets/") or path in ("/favicon.ico", "/index.html", "/"):
        return True
    return False
