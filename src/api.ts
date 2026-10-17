import type { EncryptedEnvelope } from './crypto';

/**
 * The one production backend. Baked in, not user-editable — a customer signs
 * in with their own credentials only, the same way any hosted app's web
 * client just knows its own API host. Override via VITE_ONECON_API_URL for
 * local development against a different backend; this is a build-time
 * developer setting, never surfaced in the UI.
 */
export const DEFAULT_API = import.meta.env.VITE_ONECON_API_URL ?? 'https://oneaimemory.com';

/**
 * The remote (HTTP + OAuth) MCP server — where ChatGPT and other remote-only
 * AI clients connect. Separate service from DEFAULT_API (see
 * remote-mcp-server/), same "baked in, not user-editable" reasoning.
 */
export const REMOTE_MCP_URL = import.meta.env.VITE_REMOTE_MCP_URL ?? 'https://mcp.oneaimemory.com';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export interface Session {
  userId: number;
  email: string;
  dataKeySalt: string;
  keyFingerprint: string | null;
  accessToken: string;
  refreshToken: string;
  apiUrl: string;
}

/**
 * Tokens persist in sessionStorage so a reload does not force a re-login, but
 * the DATA KEY never does — it is re-derived from the passphrase each session.
 * A stolen sessionStorage dump therefore yields API access to ciphertext, not
 * the ability to read it.
 */
const SESSION_KEY = 'onecon.session';

export function loadSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export class Api {
  constructor(private session: Session | null = loadSession()) {}

  get apiUrl(): string {
    return this.session?.apiUrl ?? DEFAULT_API;
  }

  get current(): Session | null {
    return this.session;
  }

  private async request<T>(
    path: string,
    opts: { method?: string; body?: unknown; auth?: boolean; apiUrl?: string } = {},
  ): Promise<T> {
    const base = opts.apiUrl ?? this.apiUrl;
    const send = (token?: string) =>
      fetch(base + path, {
        method: opts.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });

    if (opts.auth && !this.session) throw new ApiError(401, 'not_signed_in');
    let res = await send(opts.auth ? this.session!.accessToken : undefined);

    // Access tokens expire in 15 minutes; refresh once and retry.
    if (res.status === 401 && opts.auth && this.session) {
      const ok = await this.refresh();
      if (!ok) {
        clearSession();
        throw new ApiError(401, 'session_expired', 'Your session expired. Sign in again.');
      }
      res = await send(this.session.accessToken);
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ApiError(res.status, (data.error as string) ?? 'request_failed', data.message as string);
    }
    return data as T;
  }

  private async refresh(): Promise<boolean> {
    if (!this.session) return false;
    try {
      const res = await fetch(this.session.apiUrl + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.session.refreshToken }),
      });
      if (!res.ok) return false;
      const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
      this.session = { ...this.session, ...tokens };
      saveSession(this.session);
      return true;
    } catch {
      return false;
    }
  }

  async login(apiUrl: string, email: string, password: string): Promise<Session> {
    const r = await this.request<Omit<Session, 'apiUrl'>>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      apiUrl,
    });
    this.session = { ...r, apiUrl };
    saveSession(this.session);
    return this.session;
  }

  logout(): void {
    void this.request('/api/auth/logout', { method: 'POST', auth: true }).catch(() => {});
    this.session = null;
    clearSession();
  }

  // --- passkeys ------------------------------------------------------------

  async passkeyRegisterOptions(): Promise<Record<string, unknown> & { challenge: string }> {
    return this.request('/api/auth/passkey/register/options', { method: 'POST', auth: true });
  }

  async passkeyRegisterVerify(body: {
    response: unknown;
    challenge: string;
    deviceLabel: string;
    prfSalt?: string;
    wrappedKey?: string;
    wrappedKeyIv?: string;
  }): Promise<{ id: number; deviceLabel: string; canUnlock: boolean }> {
    return this.request('/api/auth/passkey/register/verify', { method: 'POST', body, auth: true });
  }

  async passkeyLoginOptions(apiUrl: string): Promise<{ challenge: string; rpId?: string }> {
    return this.request('/api/auth/passkey/login/options', { method: 'POST', apiUrl });
  }

  /** Signs in and returns the wrapped data key, which only this device can open. */
  async passkeyLoginVerify(
    apiUrl: string,
    body: { response: unknown; challenge: string },
  ): Promise<
    Omit<Session, 'apiUrl'> & {
      prfSalt: string | null;
      wrappedKey: string | null;
      wrappedKeyIv: string | null;
    }
  > {
    const r = await this.request<
      Omit<Session, 'apiUrl'> & { prfSalt: string | null; wrappedKey: string | null; wrappedKeyIv: string | null }
    >('/api/auth/passkey/login/verify', { method: 'POST', body, apiUrl });
    this.session = { ...r, apiUrl };
    saveSession(this.session);
    return r;
  }

  async passkeys(): Promise<{
    passkeys: Array<{
      id: number;
      deviceLabel: string;
      createdAt: string;
      lastUsedAt: string | null;
      backedUp: boolean;
      canUnlock: boolean;
    }>;
  }> {
    return this.request('/api/auth/passkey', { auth: true });
  }

  async deletePasskey(id: number): Promise<void> {
    await this.request(`/api/auth/passkey/${id}`, { method: 'DELETE', auth: true });
  }

  async events(params: { limit?: number; types?: string[]; cursor?: string } = {}): Promise<{
    events: EncryptedEnvelope[];
    nextCursor: string | null;
  }> {
    const q = new URLSearchParams({ limit: String(params.limit ?? 200) });
    if (params.types?.length) q.set('types', params.types.join(','));
    if (params.cursor) q.set('cursor', params.cursor);
    return this.request(`/api/sync/events?${q}`, { auth: true });
  }

  async status(): Promise<{
    totalEvents: number;
    breakdown: Record<string, number>;
    devices: Array<{ deviceId: string; deviceName: string; deviceType: string; lastSync: string | null; active: boolean }>;
  }> {
    return this.request('/api/sync/status', { auth: true });
  }

  async preferences(): Promise<{
    preferences: Record<string, number | string>;
    blockedPatterns: Array<{ pattern_type: string; pattern: string }>;
  }> {
    return this.request('/api/account/preferences', { auth: true });
  }

  async updatePreferences(patch: Record<string, unknown>): Promise<void> {
    await this.request('/api/account/preferences', { method: 'PATCH', body: patch, auth: true });
  }

  async addBlock(type: string, pattern: string): Promise<void> {
    await this.request('/api/account/blocklist', { method: 'POST', body: { type, pattern }, auth: true });
  }

  async removeBlock(type: string, pattern: string): Promise<void> {
    await this.request('/api/account/blocklist', { method: 'DELETE', body: { type, pattern }, auth: true });
  }

  async integrations(): Promise<{
    integrations: Array<{ id: number; label: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }>;
  }> {
    return this.request('/api/account/integrations', { auth: true });
  }

  async revokeIntegration(id: number): Promise<void> {
    await this.request(`/api/account/integrations/${id}`, { method: 'DELETE', auth: true });
  }

  /**
   * Mints a token for a remote AI client (see pages/OAuthConsent.tsx) — the
   * one-time secret is handed straight to remote-mcp-server's /complete
   * endpoint, never displayed or stored here.
   */
  async createIntegration(label: string, scopes: string[]): Promise<{ id: number; token: string; scopes: string[] }> {
    return this.request('/api/account/integrations', { method: 'POST', body: { label, scopes }, auth: true });
  }

  async getRemoteAccessStatus(): Promise<{ enabled: boolean; enabledAt: string | null }> {
    return this.request('/api/account/remote-access/status', { auth: true });
  }

  async audit(limit = 100): Promise<{ entries: Array<Record<string, unknown>>; note: string }> {
    return this.request(`/api/account/audit?limit=${limit}`, { auth: true });
  }

  async deleteEvents(eventUuids: string[]): Promise<{ deleted: number }> {
    return this.request('/api/account/events', { method: 'DELETE', body: { eventUuids }, auth: true });
  }

  async deleteAllEvents(): Promise<{ deleted: number }> {
    return this.request('/api/account/events', { method: 'DELETE', body: {}, auth: true });
  }

  async exportRaw(): Promise<unknown> {
    return this.request('/api/account/export', { auth: true });
  }

  async devices(): Promise<{ devices: Array<{ deviceId: string; deviceName: string; deviceType: string; lastSync: string | null; active: boolean }> }> {
    return this.request('/api/sync/devices', { auth: true });
  }

  async removeDevice(deviceId: string): Promise<void> {
    await this.request(`/api/sync/devices/${deviceId}`, { method: 'DELETE', auth: true });
  }
}
