"""
Firebase authentication middleware for FastAPI.

Verifies Firebase ID tokens and extracts user information.
"""

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from functools import lru_cache

from app.logging_config import get_logger

logger = get_logger(__name__)

# Initialize Firebase Admin SDK
# For development: initialize without credentials (works for token verification)
# For production: use service account JSON
try:
    firebase_admin.get_app()
except ValueError:
    # No app exists yet, initialize
    firebase_admin.initialize_app()
    logger.info("Firebase Admin SDK initialized")

security = HTTPBearer()


class AuthenticatedUser:
    """Represents an authenticated user from Firebase."""
    
    def __init__(self, uid: str, email: str | None, name: str | None):
        self.uid = uid
        self.email = email
        self.name = name
    
    def __repr__(self):
        return f"AuthenticatedUser(uid={self.uid}, email={self.email})"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> AuthenticatedUser:
    """
    Verify Firebase ID token and return authenticated user.
    
    Raises:
        HTTPException: If token is invalid or expired.
    """
    try:
        token = credentials.credentials
        
        # Verify the ID token
        decoded_token = auth.verify_id_token(token)
        
        # Extract user information
        uid = decoded_token["uid"]
        email = decoded_token.get("email")
        name = decoded_token.get("name")
        
        logger.debug(f"Authenticated user: {uid} ({email})")
        
        return AuthenticatedUser(uid=uid, email=email, name=name)
        
    except auth.ExpiredIdTokenError:
        logger.warning("Expired Firebase token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.InvalidIdTokenError:
        logger.warning("Invalid Firebase token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False))
) -> AuthenticatedUser | None:
    """
    Optional authentication - returns None if no token provided.
    Useful for endpoints that work with or without auth.
    """
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        decoded_token = auth.verify_id_token(token)
        
        return AuthenticatedUser(
            uid=decoded_token["uid"],
            email=decoded_token.get("email"),
            name=decoded_token.get("name"),
        )
    except Exception:
        return None

