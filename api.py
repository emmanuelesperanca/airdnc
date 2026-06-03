"""
AirDnC - Backend API (api.py)

Endpoints:
  POST /api/auth/callback      <- Power Automate: recebe perfil O365, gera JWT, devolve magic_link
  POST /api/auth/validate      <- Front-end: valida JWT do magic link, devolve perfil
  POST /api/audit              <- Front-end: eventos de auditoria (non-blocking, 202)
  POST /api/presence           <- Front-end / PA: grava registro de presença no DB
  GET  /api/presence?date=     <- Front-end: lê presença agregada por equipe para uma data
  POST /api/presence/sync      <- PA agendado: sincroniza eventos do Teams Calendar com o DB
  GET  /health                 <- Health-check

Execucao dev:
    uvicorn api:app --reload --port 5000

Execucao producao (async, aguenta ~200 req/s com 4 workers):
    uvicorn api:app --host 0.0.0.0 --port 5000 --workers 4

Variaveis de ambiente (.env):
    JWT_SECRET, AIRDNC_BASE_URL, PA_CALLBACK_SECRET,
    ALLOWED_DOMAINS, TOKEN_TTL_MINUTES, CORS_ORIGINS, PORT,
    DB_HOST, DB_NAME, DB_SCHEMA, DB_USER, DB_PASS, DB_DRIVER
"""

import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, field_validator
import jwt
import uvicorn

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Auth / App config ────────────────────────────────────────────────────────
JWT_SECRET      = os.environ["JWT_SECRET"]
AIRDNC_BASE_URL = os.getenv("AIRDNC_BASE_URL", "http://localhost:5000").rstrip("/")
ALLOWED_DOMAINS = [d.strip() for d in os.getenv("ALLOWED_DOMAINS", "straumann.com").split(",") if d.strip()]
TOKEN_TTL_MIN   = int(os.getenv("TOKEN_TTL_MINUTES", "10"))
PA_CB_SECRET    = os.getenv("PA_CALLBACK_SECRET", "")
_cors_origins   = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]

# ── Database config (optional — graceful degradation if not set) ─────────────
DB_HOST   = os.getenv("DB_HOST", "")
DB_NAME   = os.getenv("DB_NAME", "")
DB_SCHEMA = os.getenv("DB_SCHEMA", "tech_solutions")
DB_USER   = os.getenv("DB_USER", "")
DB_PASS   = os.getenv("DB_PASS", "")
DB_DRIVER = os.getenv("DB_DRIVER", "ODBC Driver 18 for SQL Server")

_DB_AVAILABLE = bool(DB_HOST and DB_NAME and DB_USER and DB_PASS)

if _DB_AVAILABLE:
    try:
        import pyodbc
        log.info("pyodbc loaded — DB=%s/%s", DB_HOST, DB_NAME)
    except ImportError:
        log.warning("pyodbc not installed — running without database persistence")
        _DB_AVAILABLE = False


def _conn_str() -> str:
    return (
        f"DRIVER={{{DB_DRIVER}}};"
        f"SERVER={DB_HOST};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASS};"
        "Encrypt=yes;TrustServerCertificate=no;"
        "Connection Timeout=10;"
    )


def _db_query_sync(sql: str, params: tuple) -> list[dict]:
    """Executa SELECT síncrono e retorna lista de dicts. Roda em thread executor."""
    with pyodbc.connect(_conn_str()) as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [c[0] for c in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def _db_exec_sync(sql: str, params: tuple) -> None:
    """Executa INSERT/UPDATE/MERGE síncrono. Roda em thread executor."""
    with pyodbc.connect(_conn_str()) as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


async def db_query(sql: str, *params) -> list[dict]:
    if not _DB_AVAILABLE:
        return []
    return await asyncio.to_thread(_db_query_sync, sql, params)


async def db_exec(sql: str, *params) -> None:
    if not _DB_AVAILABLE:
        log.debug("DB not available — skipping exec")
        return
    await asyncio.to_thread(_db_exec_sync, sql, params)


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="AirDnC API",
    description="Magic Link auth + Presence management via Teams / Power Automate",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "X-PA-Secret"],
)


# ══════════════════════════════════════════════════════════════════════════════
#  Pydantic models
# ══════════════════════════════════════════════════════════════════════════════

VALID_PRESENCE_TYPES = {"office", "home", "fabrica", "banco", "ferias"}


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


class PresenceRecord(BaseModel):
    user_email:     EmailStr
    user_name:      str
    department:     str = ""
    team_name:      str = ""
    presence_type:  str
    presence_date:  str          # YYYY-MM-DD
    end_date:       str = ""     # YYYY-MM-DD — só para is_range=True (férias)
    is_range:       bool = False
    event_title:    str = ""
    teams_event_id: str = ""
    source:         str = "app"  # 'app' | 'teams_import' | 'admin'

    @field_validator("presence_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in VALID_PRESENCE_TYPES:
            raise ValueError(f"presence_type must be one of {VALID_PRESENCE_TYPES}")
        return v

    @field_validator("presence_date", "end_date")
    @classmethod
    def valid_date(cls, v: str) -> str:
        if not v:
            return v
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("date must be YYYY-MM-DD")
        return v


class SyncRecord(BaseModel):
    user_email:    EmailStr
    user_name:     str
    team_name:     str = ""
    presence_type: str
    presence_date: str
    end_date:      str = ""
    is_range:      bool = False
    event_title:   str = ""
    teams_event_id:str = ""

    @field_validator("presence_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in VALID_PRESENCE_TYPES:
            raise ValueError(f"Invalid presence_type: {v}")
        return v


class BulkSyncRequest(BaseModel):
    records: list[SyncRecord]
    sync_date: str = ""   # data de referência da sincronização


# ══════════════════════════════════════════════════════════════════════════════
#  Auth helpers
# ══════════════════════════════════════════════════════════════════════════════

def _check_pa_secret(secret: str, client_ip: str) -> None:
    if PA_CB_SECRET and secret != PA_CB_SECRET:
        log.warning("Rejected callback - invalid X-PA-Secret from %s", client_ip)
        raise HTTPException(status_code=403, detail="Forbidden")


# ══════════════════════════════════════════════════════════════════════════════
#  Auth endpoints
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
#  Audit endpoint
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/audit", status_code=202)
async def audit(body: AuditRequest):
    log.info("AUDIT | type=%-20s email=%s status=%s", body.type, body.email, body.status)

    if _DB_AVAILABLE and body.type in ("login", "logout", "login_fail", "session_expire"):
        try:
            await db_exec(
                f"""
                INSERT INTO {DB_SCHEMA}.tb_login_logs
                  (email, user_name, event_type, status, error_msg, user_agent)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                body.email or None,
                body.user_name or None,
                body.type or "login",
                body.status or "success",
                body.error_msg or None,
                body.user_agent[:512] if body.user_agent else None,
            )
        except Exception as exc:
            log.error("Audit DB write failed: %s", exc)

    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
#  Presence endpoints
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/presence", status_code=201)
async def write_presence(body: PresenceRecord):
    """
    Grava ou atualiza um registro de presença.
    Chamado pelo front-end sempre que o usuário define seu status do dia.

    Para is_range=False (office/home/fabrica/banco):
      → UPSERT: 1 registro por (user_email, presence_date)

    Para is_range=True (ferias):
      → INSERT simples (permite múltiplos períodos por usuário)
    """
    log.info(
        "PRESENCE WRITE | %s | %s → %s%s",
        body.user_email, body.presence_date,
        body.presence_type,
        f" até {body.end_date}" if body.end_date else "",
    )

    if not _DB_AVAILABLE:
        log.debug("DB not configured — presence record not persisted")
        return {"ok": True, "persisted": False}

    try:
        if not body.is_range:
            # UPSERT: se já existe registro para (email, date), atualiza
            await db_exec(
                f"""
                IF EXISTS (
                    SELECT 1 FROM {DB_SCHEMA}.tb_presence
                    WHERE user_email = ? AND presence_date = ? AND is_range = 0
                )
                    UPDATE {DB_SCHEMA}.tb_presence
                    SET presence_type   = ?,
                        event_title     = ?,
                        teams_event_id  = ?,
                        source          = ?,
                        updated_at      = GETUTCDATE()
                    WHERE user_email = ? AND presence_date = ? AND is_range = 0
                ELSE
                    INSERT INTO {DB_SCHEMA}.tb_presence
                      (user_email, user_name, department, team_name, presence_type,
                       presence_date, is_range, event_title, teams_event_id, source)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                """,
                # EXISTS check
                body.user_email, body.presence_date,
                # UPDATE
                body.presence_type, body.event_title or None, body.teams_event_id or None,
                body.source,
                body.user_email, body.presence_date,
                # INSERT
                body.user_email, body.user_name, body.department or None,
                body.team_name or None, body.presence_type, body.presence_date,
                body.event_title or None, body.teams_event_id or None, body.source,
            )
        else:
            # Férias: INSERT simples
            await db_exec(
                f"""
                INSERT INTO {DB_SCHEMA}.tb_presence
                  (user_email, user_name, department, team_name, presence_type,
                   presence_date, end_date, is_range, event_title, teams_event_id, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                body.user_email, body.user_name, body.department or None,
                body.team_name or None, body.presence_type,
                body.presence_date, body.end_date or None,
                body.event_title or None, body.teams_event_id or None, body.source,
            )

        return {"ok": True, "persisted": True}

    except Exception as exc:
        log.error("Presence write failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database write failed")


@app.get("/api/presence")
async def read_presence(date: str = Query(..., description="YYYY-MM-DD")):
    """
    Retorna presença de todos os usuários para uma data específica.

    Resposta:
      {
        "date": "2026-06-10",
        "persisted": true,
        "presence": { "João Silva": "home", "Maria Souza": "fabrica", ... },
        "teams": {
          "Time da Vanessa": { "home": 2, "fabrica": 1, "office": 5, "banco": 0, "total": 8 },
          ...
        }
      }

    Inclui:
      - Registros pontuais (is_range=0) com presence_date = date
      - Registros de férias (is_range=1) cujo período cobre a data
    """
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    if not _DB_AVAILABLE:
        return {"date": date, "persisted": False, "presence": {}, "teams": {}}

    try:
        rows = await db_query(
            f"""
            SELECT user_name, team_name, presence_type
            FROM {DB_SCHEMA}.tb_presence
            WHERE is_range = 0 AND presence_date = ?

            UNION ALL

            SELECT user_name, team_name, presence_type
            FROM {DB_SCHEMA}.tb_presence
            WHERE is_range = 1
              AND presence_date <= ?
              AND (end_date >= ? OR end_date IS NULL)
            """,
            date, date, date,
        )
    except Exception as exc:
        log.error("Presence read failed: %s", exc)
        raise HTTPException(status_code=500, detail="Database read failed")

    presence: dict[str, str] = {}
    teams:    dict[str, dict] = {}

    for row in rows:
        name   = row["user_name"]
        team   = row.get("team_name") or ""
        ptype  = row["presence_type"]

        # Última entrada vence (evita duplicatas na UNION)
        presence[name] = ptype

        if team:
            if team not in teams:
                teams[team] = {"home": 0, "fabrica": 0, "office": 0, "banco": 0, "ferias": 0, "total": 0}
            teams[team][ptype] = teams[team].get(ptype, 0) + 1
            teams[team]["total"] += 1

    return {"date": date, "persisted": True, "presence": presence, "teams": teams}


@app.post("/api/presence/sync", status_code=200)
async def sync_presence(
    body:        BulkSyncRequest,
    request:     Request,
    x_pa_secret: str = Header(default=""),
):
    """
    Sincronização em lote iniciada pelo fluxo PA agendado.
    Lê eventos do Teams Calendar de todos os usuários e grava no DB.
    Protegido por X-PA-Secret.

    O PA deve chamar esse endpoint 1x ao dia (ex: 7h da manhã) com
    os eventos de calendário de todos os colaboradores para a semana atual.
    """
    _check_pa_secret(x_pa_secret, request.client.host)

    if not _DB_AVAILABLE:
        log.warning("Presence sync called but DB not configured")
        return {"ok": True, "persisted": False, "synced": 0}

    synced = 0
    errors = 0

    for rec in body.records:
        try:
            if not rec.is_range:
                await db_exec(
                    f"""
                    IF EXISTS (
                        SELECT 1 FROM {DB_SCHEMA}.tb_presence
                        WHERE user_email = ? AND presence_date = ? AND is_range = 0
                    )
                        UPDATE {DB_SCHEMA}.tb_presence
                        SET presence_type   = ?,
                            teams_event_id  = ?,
                            source          = 'teams_import',
                            updated_at      = GETUTCDATE()
                        WHERE user_email = ? AND presence_date = ? AND is_range = 0
                    ELSE
                        INSERT INTO {DB_SCHEMA}.tb_presence
                          (user_email, user_name, team_name, presence_type,
                           presence_date, is_range, event_title, teams_event_id, source)
                        VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'teams_import')
                    """,
                    rec.user_email, rec.presence_date,
                    rec.presence_type, rec.teams_event_id or None,
                    rec.user_email, rec.presence_date,
                    rec.user_email, rec.user_name, rec.team_name or None,
                    rec.presence_type, rec.presence_date,
                    rec.event_title or None, rec.teams_event_id or None,
                )
            else:
                # Períodos de férias: verifica por event_id para não duplicar
                existing = await db_query(
                    f"""
                    SELECT id FROM {DB_SCHEMA}.tb_presence
                    WHERE teams_event_id = ? AND is_range = 1
                    """,
                    rec.teams_event_id,
                )
                if not existing:
                    await db_exec(
                        f"""
                        INSERT INTO {DB_SCHEMA}.tb_presence
                          (user_email, user_name, team_name, presence_type,
                           presence_date, end_date, is_range, event_title, teams_event_id, source)
                        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'teams_import')
                        """,
                        rec.user_email, rec.user_name, rec.team_name or None,
                        rec.presence_type, rec.presence_date, rec.end_date or None,
                        rec.event_title or None, rec.teams_event_id or None,
                    )
            synced += 1
        except Exception as exc:
            log.error("Sync record failed (%s %s): %s", rec.user_email, rec.presence_date, exc)
            errors += 1

    log.info("Presence sync complete — synced=%d errors=%d date=%s", synced, errors, body.sync_date)
    return {"ok": True, "persisted": True, "synced": synced, "errors": errors}


# ══════════════════════════════════════════════════════════════════════════════
#  Health
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    db_status = "configured" if _DB_AVAILABLE else "not_configured"
    return {"status": "ok", "service": "airdnc-api", "db": db_status}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    log.info("AirDnC API v2 starting on port %d (DB: %s)", port, "on" if _DB_AVAILABLE else "off")
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False, workers=4)


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