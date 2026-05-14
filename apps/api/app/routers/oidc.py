"""Generic OIDC login (architecture §3.3 / §9 V2)."""

from __future__ import annotations

import secrets
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.security import create_access_token, hash_password
from app.services.org_bootstrap import create_default_organization_for_user

router = APIRouter(prefix="/auth/oidc", tags=["auth-oidc"])


def _require_oidc() -> dict[str, str]:
    s = get_settings()
    if not s.oidc_enabled or not s.oidc_issuer or not s.oidc_client_id:
        raise HTTPException(status_code=503, detail="OIDC is not configured")
    return {
        "issuer": s.oidc_issuer.rstrip("/"),
        "client_id": s.oidc_client_id,
        "client_secret": s.oidc_client_secret or "",
        "redirect": s.oidc_redirect_uri_override
        or f"{s.api_public_url.rstrip('/')}/api/v1/auth/oidc/callback",
    }


@router.get("/login")
def oidc_login() -> RedirectResponse:
    cfg = _require_oidc()
    meta_url = f"{cfg['issuer']}/.well-known/openid-configuration"
    with httpx.Client(timeout=20.0) as client:
        meta = client.get(meta_url).json()
    auth_ep = meta.get("authorization_endpoint")
    if not auth_ep:
        raise HTTPException(500, detail="OIDC discovery failed")
    state = secrets.token_urlsafe(32)
    params = {
        "response_type": "code",
        "client_id": cfg["client_id"],
        "redirect_uri": cfg["redirect"],
        "scope": "openid email profile",
        "state": state,
    }
    url = auth_ep + "?" + urllib.parse.urlencode(params)
    resp = RedirectResponse(url, status_code=302)
    resp.set_cookie("wr_oidc_state", state, httponly=True, samesite="lax", max_age=600)
    return resp


@router.get("/callback")
def oidc_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    cfg = _require_oidc()
    cookie_state = request.cookies.get("wr_oidc_state")
    if not code or not state or state != cookie_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    meta_url = f"{cfg['issuer']}/.well-known/openid-configuration"
    with httpx.Client(timeout=30.0) as client:
        meta = client.get(meta_url).json()
        token_ep = meta["token_endpoint"]
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": cfg["redirect"],
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
        }
        tr = client.post(token_ep, data=data)
        tr.raise_for_status()
        tokens = tr.json()
        access = tokens.get("access_token")
        if not access:
            raise HTTPException(status_code=400, detail="No access_token from IdP")
        userinfo_ep = meta.get("userinfo_endpoint")
        email = None
        sub = None
        if userinfo_ep:
            ui = client.get(userinfo_ep, headers={"Authorization": f"Bearer {access}"})
            ui.raise_for_status()
            info = ui.json()
            email = info.get("email")
            sub = info.get("sub")
        if not email or not sub:
            raise HTTPException(status_code=400, detail="OIDC userinfo missing email or sub")

    user = db.query(User).filter(User.oidc_sub == sub, User.oidc_issuer == cfg["issuer"]).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.oidc_sub = sub
            user.oidc_issuer = cfg["issuer"]
            user.auth_provider = "oidc"
        else:
            user = User(
                email=email,
                hashed_password=hash_password(secrets.token_urlsafe(32)),
                auth_provider="oidc",
                oidc_sub=sub,
                oidc_issuer=cfg["issuer"],
            )
            db.add(user)
            db.flush()
            create_default_organization_for_user(db, user)
    db.commit()
    token = create_access_token(str(user.email))
    front = get_settings().public_app_url.rstrip("/")
    resp = RedirectResponse(f"{front}/#token={urllib.parse.quote(token)}", status_code=302)
    resp.delete_cookie("wr_oidc_state")
    return resp
