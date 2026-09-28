// Sessao do cliente: expira 1h apos o login (limite absoluto, independente de
// atividade). Fonte unica de verdade para o middleware, o login e o aviso de
// expiracao no cliente.
export const SESSION_MAX_AGE_MS = 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;
export const SESSION_START_COOKIE = "client_session_start";
