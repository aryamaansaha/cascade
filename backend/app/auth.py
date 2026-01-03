"""
Firebase authentication middleware for FastAPI.

Verifies Firebase ID tokens and extracts user information.
"""

import os
from pathlib import Path
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.logging_config import get_logger

logger = get_logger(__name__)

# Initialize Firebase Admin SDK
# Look for service account key in multiple locations
def _init_firebase():
    try:
        firebase_admin.get_app()
        return  # Already initialized
    except ValueError:
        pass  # Need to initialize
    
    # Try to find service account key
    # __file__ = backend/app/auth.py → .parent.parent = backend/
    backend_dir = Path(__file__).parent.parent
    
    possible_paths = [
        backend_dir / "serviceAccountKey.json",
        backend_dir / "firebase-service-account.json",
    ]
    
    # Also check for Firebase's default naming pattern: *-firebase-adminsdk-*.json
    possible_paths.extend(backend_dir.glob("*-firebase-adminsdk-*.json"))
    
    # Also check environment variable
    env_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if env_path:
        possible_paths.append(Path(env_path))
    
    for key_path in possible_paths:
        if key_path.exists() and key_path.is_file():
            cred = credentials.Certificate(str(key_path))
            firebase_admin.initialize_app(cred)
            logger.info(f"Firebase Admin SDK initialized with: {key_path.name}")
            return
    
    # Fallback: initialize without credentials (may not work for token verification)
    logger.warning("No Firebase service account key found! Token verification may fail.")
    logger.warning("Download from: Firebase Console > Project Settings > Service Accounts")
    firebase_admin.initialize_app()
    logger.info("Firebase Admin SDK initialized without credentials")

_init_firebase()

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

