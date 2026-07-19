"""
Verifies Supabase-issued session JWTs via the project's public JWKS endpoint
(asymmetric ES256/RS256 signing keys) — no shared secret needed on the backend.
"""

import jwt

from . import config

_jwk_client = (
    jwt.PyJWKClient(f"{config.SUPABASE_URL}/auth/v1/.well-known/jwks.json")
    if config.SUPABASE_URL
    else None
)


def verify_token(token: str) -> dict | None:
    """Return the decoded claims if `token` is a valid, unexpired Supabase session JWT."""
    if not _jwk_client:
        return None
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token, signing_key.key, algorithms=["ES256", "RS256"], audience="authenticated"
        )
    except Exception:  # noqa: BLE001
        return None
