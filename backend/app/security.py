"""
Dashboard access control — a small, pluggable auth layer.

For now it authenticates a single hardcoded admin from env (ADMIN_USER/ADMIN_PASS).
It is deliberately structured so a future subscription model (e.g. Razorpay) can
replace `authenticate()` with a real user/subscription lookup without touching
the request-handling code.
"""

import secrets

from . import config


def login_required() -> bool:
    """The gate is active only when an admin password is configured (off in dev)."""
    return bool(config.ADMIN_PASS)


def authenticate(username: str, password: str) -> bool:
    """
    Validate dashboard credentials. Constant-time comparison to avoid timing leaks.
    FUTURE: look the user up in a store and verify an active subscription here.
    """
    if not login_required():
        return True
    user_ok = secrets.compare_digest((username or "").strip(), config.ADMIN_USER)
    pass_ok = secrets.compare_digest(password or "", config.ADMIN_PASS)
    return user_ok and pass_ok


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
