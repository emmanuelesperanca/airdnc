"""
AirDnC – Backend API (api.py)
==============================
Expõe os endpoints chamados pelo Power Automate e pelo front-end
no fluxo de autenticação Magic Link via Microsoft Teams.

Fluxo:
  POST /api/auth/callback  ← chamado pelo Power Automate (Ação 3 do fluxo)
      Recebe dados do usuário do O365, gera JWT, devolve magic_link
  POST /api/auth/validate  ← chamado pelo front-end ao pousar no magic link
      Valida o JWT e devolve o perfil do usuário
  POST /api/audit          ← eventos de auditoria do front-end
  GET  /health             ← health-check

Dependências:
    pip install flask flask-cors PyJWT python-dotenv

Variáveis de ambiente (defina em .env ou no sistema — NUNCA no código):
    JWT_SECRET        — Segredo para assinar os tokens (mín. 32 caracteres)
    AIRDNC_BASE_URL   — URL pública do app  (ex: https://airdnc.empresa.com)
    PA_CALLBACK_SECRET— Segredo compartilhado com o Power Automate (header X-PA-Secret)
    ALLOWED_DOMAINS   — Domínios de e-mail permitidos, separados por vírgula
    TOKEN_TTL_MINUTES — Validade do magic link em minutos (padrão: 10)
    CORS_ORIGINS      — Origens CORS permitidas, separadas por vírgula
    PORT              — Porta do servidor (padrão: 5000)
"""

import os
import uuid
import datetime
import logging
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, request, jsonify, abort
from flask_cors import CORS
import jwt  # PyJWT ≥ 2.x

# ---------------------------------------------------------------------------
load_dotenv()

app = Flask(__name__)

_cors_origins = [o.strip() for o in os.getenv('CORS_ORIGINS', '*').split(',')]
CORS(app, origins=_cors_origins)

# ---------------------------------------------------------------------------
# Config — valores obrigatórios levantam KeyError ao iniciar se não definidos
# ---------------------------------------------------------------------------
JWT_SECRET       = os.environ['JWT_SECRET']
AIRDNC_BASE_URL  = os.getenv('AIRDNC_BASE_URL', 'http://localhost:5000').rstrip('/')
ALLOWED_DOMAINS  = [d.strip() for d in os.getenv('ALLOWED_DOMAINS', 'straumann.com').split(',') if d.strip()]
TOKEN_TTL_MIN    = int(os.getenv('TOKEN_TTL_MINUTES', '10'))
PA_CB_SECRET     = os.getenv('PA_CALLBACK_SECRET', '')  # '' = sem verificação (dev)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Decorator: restringe endpoint a chamadas autenticadas do Power Automate
# ---------------------------------------------------------------------------
def _require_pa_secret(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if PA_CB_SECRET:
            caller = request.headers.get('X-PA-Secret', '')
            if caller != PA_CB_SECRET:
                log.warning('Rejected callback — invalid X-PA-Secret from %s', request.remote_addr)
                abort(403)
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# POST /api/auth/callback
# Chamado pelo Power Automate (Ação 3 do fluxo) com o perfil do O365.
# Gera um JWT de curta duração e devolve o magic_link para o PA enviar no Teams.
# ---------------------------------------------------------------------------
@app.route('/api/auth/callback', methods=['POST'])
@_require_pa_secret
def auth_callback():
    data = request.get_json(silent=True) or {}

    email = (data.get('email') or '').strip().lower()
    name  = (data.get('name')  or '').strip()

    if not email or '@' not in email:
        return jsonify({'error': 'email is required'}), 400
    if not name:
        return jsonify({'error': 'name is required'}), 400

    domain = email.split('@', 1)[-1]
    if ALLOWED_DOMAINS and domain not in ALLOWED_DOMAINS:
        log.warning('Auth callback rejected — domain "%s" not in allowed list', domain)
        return jsonify({'error': 'Domain not authorised'}), 403

    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        'sub':      email,
        'name':     name,
        'dept':     (data.get('department') or '').strip(),
        'location': (data.get('location')   or '').strip(),
        'jti':      str(uuid.uuid4()),          # previne replay do mesmo token
        'iat':      now,
        'exp':      now + datetime.timedelta(minutes=TOKEN_TTL_MIN),
    }

    token      = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    magic_link = f'{AIRDNC_BASE_URL}/?token={token}'

    log.info('Magic link issued for %s (TTL %d min)', email, TOKEN_TTL_MIN)
    return jsonify({'magic_link': magic_link}), 200


# ---------------------------------------------------------------------------
# POST /api/auth/validate
# Chamado pelo front-end quando o usuário abre o magic link (?token=...).
# Valida o JWT e devolve o perfil.
# ---------------------------------------------------------------------------
@app.route('/api/auth/validate', methods=['POST'])
def auth_validate():
    data  = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()

    if not token:
        return jsonify({'error': 'token required'}), 400

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        log.info('Validate rejected — token expired')
        return jsonify({'error': 'link_expired'}), 401
    except jwt.InvalidTokenError as exc:
        log.warning('Validate rejected — invalid token: %s', exc)
        return jsonify({'error': 'invalid_token'}), 401

    return jsonify({
        'email':    payload['sub'],
        'name':     payload.get('name', ''),
        'dept':     payload.get('dept', ''),
        'location': payload.get('location', ''),
        'isAdmin':  payload.get('isAdmin', False),
    }), 200


# ---------------------------------------------------------------------------
# POST /api/audit
# Recebe eventos de auditoria do front-end (non-blocking).
# ---------------------------------------------------------------------------
@app.route('/api/audit', methods=['POST'])
def audit():
    data = request.get_json(silent=True) or {}
    log.info('AUDIT | type=%-16s email=%s status=%s',
             data.get('type', '-'), data.get('email', '-'), data.get('status', '-'))
    # TODO: persistir em tech_solutions.tb_login_logs via pyodbc
    return jsonify({'ok': True}), 200


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'airdnc-api'}), 200


# ---------------------------------------------------------------------------
if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    log.info('AirDnC API starting on port %d (debug=%s)', port, debug)
    app.run(host='0.0.0.0', port=port, debug=debug)
