"""
AirDnC - Backend API (api.py)

Endpoints:
  POST /api/auth/callback  <- Power Automate: recebe perfil O365, gera JWT, devolve magic_link
  POST /api/auth/validate  <- Front-end: valida JWT do magic link, devolve perfil
  POST /api/audit          <- Front-end: eventos de auditoria (non-blocking, 202)
  GET  /health             <- Health-check

Execucao dev:
    uvicorn api:app --reload --port 5000

Execucao producao (async, aguenta ~200 req/s com 4 workers):
    uvicorn api:app --host 0.0.0.0 --port 5000 --workers 4

Variaveis de ambiente (.env):
    JWT_SECRET, AIRDNC_BASE_URL, PA_CALLBACK_SECRET,
    ALLOWED_DOMAINS, TOKEN_TTL_MINUTES, CORS_ORIGINS, PORT
"""

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, field_validator
import jwt
import uvicorn

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

JWT_SECRET      = os.environ["JWT_SECRET"]
AIRDNC_BASE_URL = os.getenv("AIRDNC_BASE_URL", "http://localhost:5000").rstrip("/")
ALLOWED_DOMAINS = [d.strip() for d in os.getenv("ALLOWED_DOMAINS", "straumann.com").split(",") if d.strip()]
TOKEN_TTL_MIN   = int(os.getenv("TOKEN_TTL_MINUTES", "10"))
PA_CB_SECRET    = os.getenv("PA_CALLBACK_SECRET", "")
_cors_origins   = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]

app = FastAPI(
    title="AirDnC API",
    description="Magic Link auth via Teams + Power Automate",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-PA-Secret"],
)


class CallbackRequest(BaseModel):
    email:      EmailStr
    name:       str
    department: str = ""
    location:   str = ""

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()


class ValidateRequest(BaseModel):
    token: str


class AuditRequest(BaseModel):
    type:       str = ""
    email:      str = ""
    user_name:  str = ""
    status:     str = ""
    error_msg:  str = ""
    app:        str = ""
    user_agent: str = ""
    timestamp:  str = ""


def _check_pa_secret(secret: str, client_ip: str) -> None:
    if PA_CB_SECRET and secret != PA_CB_SECRET:
        log.warning("Rejected callback - invalid X-PA-Secret from %s", client_ip)
        raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/api/auth/callback")
async def auth_callback(
    body:        CallbackRequest,
    request:     Request,
    x_pa_secret: str = Header(default=""),
):
    _check_pa_secret(x_pa_secret, request.client.host)

    email  = str(body.email).lower()
    domain = email.split("@", 1)[-1]
    if ALLOWED_DOMAINS and domain not in ALLOWED_DOMAINS:
        log.warning("Auth callback rejected - domain '%s' not allowed", domain)
        raise HTTPException(status_code=403, detail="Domain not authorised")

    now = datetime.now(timezone.utc)
    payload = {
        "sub":      email,
        "name":     body.name,
        "dept":     body.department.strip(),
        "location": body.location.strip(),
        "jti":      str(uuid.uuid4()),
        "iat":      now,
        "exp":      now + timedelta(minutes=TOKEN_TTL_MIN),
    }

    token      = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    magic_link = f"{AIRDNC_BASE_URL}/?token={token}"

    log.info("Magic link issued for %s (TTL %d min)", email, TOKEN_TTL_MIN)
    return {"magic_link": magic_link}


@app.post("/api/auth/validate")
async def auth_validate(body: ValidateRequest):
    try:
        payload = jwt.decode(body.token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        log.info("Validate rejected - token expired")
        raise HTTPException(status_code=401, detail={"error": "link_expired"})
    except jwt.InvalidTokenError as exc:
        log.warning("Validate rejected - invalid token: %s", exc)
        raise HTTPException(status_code=401, detail={"error": "invalid_token"})

    return {
        "email":    payload["sub"],
        "name":     payload.get("name", ""),
        "dept":     payload.get("dept", ""),
        "location": payload.get("location", ""),
        "isAdmin":  payload.get("isAdmin", False),
    }


@app.post("/api/audit", status_code=202)
async def audit(body: AuditRequest):
    log.info("AUDIT | type=%-16s email=%s status=%s", body.type, body.email, body.status)
    # TODO: persistir em tech_solutions.tb_login_logs via aioodbc
    return {"ok": True}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "airdnc-api"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    log.info("AirDnC API starting on port %d", port)
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False, workers=4)