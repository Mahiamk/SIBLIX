"""
Package init — loads backend/.env before any submodule reads os.environ.

connection.py resolves DATABASE_URL and auth.py resolves AUTH_SECRET at
import time, so the .env file has to be in place before those run. Without
this the app silently ignored .env entirely and fell back to local SQLite
and the default signing key, which is not what the configured deployment
expects.

Precedence: a real environment variable always wins over .env, so
docker-compose, CI and one-off overrides such as

    DATABASE_URL=sqlite:///./storage/test.db pytest tests/

work as written. If .env looks like it is being ignored, something has
already exported that variable in your shell — `unset DATABASE_URL` rather
than switching this to override=True, which would make the file beat every
deployment's own configuration.
"""
import os

try:
    from dotenv import load_dotenv

    # override=False (the default) is deliberate — see the note above.
    load_dotenv(
        os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        override=False,
    )
except ImportError:  # python-dotenv absent: fall back to the real environment
    pass
