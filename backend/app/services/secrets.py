"""
secrets.py — symmetric encryption for credentials held at rest.

Mailbox passwords have to be replayable (we log in to IMAP on every sync),
so they cannot be hashed like account passwords. They are encrypted with a
key derived from AUTH_SECRET instead, so the database alone does not hand
over a working mailbox login.
"""
import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


def _key() -> bytes:
    secret = os.environ.get("AUTH_SECRET", "sdoc-dev-secret-change-me").encode()
    # Fernet needs a 32-byte urlsafe-base64 key; derive one deterministically.
    return base64.urlsafe_b64encode(hashlib.sha256(b"mailbox:" + secret).digest())


def encrypt(plaintext: str) -> str:
    return Fernet(_key()).encrypt((plaintext or "").encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Returns "" when the value cannot be decrypted — e.g. AUTH_SECRET was
    rotated, which invalidates every stored mailbox password."""
    try:
        return Fernet(_key()).decrypt((ciphertext or "").encode()).decode()
    except (InvalidToken, ValueError, TypeError):
        return ""
