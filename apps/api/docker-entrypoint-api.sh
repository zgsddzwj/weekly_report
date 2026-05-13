#!/bin/sh
set -e
if [ -z "$ENCRYPTION_KEY" ]; then
  echo "ERROR: ENCRYPTION_KEY is required (Fernet key from: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\")" >&2
  exit 1
fi
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
