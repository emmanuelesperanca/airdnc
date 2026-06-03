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
// URL do fluxo PA para criar eventos de dia-inteiro na agenda do Teams
// Recebe: { email, user_name, type: 'home'|'fabrica', date, event_title }
// Cria um evento de dia inteiro na agenda do usuário
window.PA_CREATE_EVENT_URL = 'https://PREENCHA_COM_URL_DO_FLOW_DE_EVENTO';

// URL do fluxo PA para buscar presença de todas as equipes
// Recebe: { date } → Retorna: { presence: { 'Nome': 'home'|'office'|'fabrica' },
//                               teams:    { 'Time X': { home, fabrica, office, total } } }
window.PA_PRESENCE_URL = 'https://PREENCHA_COM_URL_DO_FLOW_DE_PRESENCA';
