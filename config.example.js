// ============================================================
//  AirDnC – Configuração local (NÃO commitado no git)
//
//  Copie este arquivo para config.js e preencha as URLs.
//  O arquivo config.js está no .gitignore.
// ============================================================

// URL do HTTP Trigger do Power Automate (Ação 1 do fluxo)
// → O front-end envia o e-mail do usuário aqui
window.PA_LOGIN_URL = 'https://PREENCHA_COM_URL_DO_HTTP_TRIGGER_DO_PA';

// URL do fluxo de auditoria (opcional — pode usar o mesmo ou outro fluxo PA)
window.PA_AUDIT_URL = '';

// URL base da API Python (api.py) em execução
// Desenvolvimento local:  'http://localhost:5000'
// Produção:              'https://api.suaempresa.com'
window.API_BASE_URL = 'http://localhost:5000';
