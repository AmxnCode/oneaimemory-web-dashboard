import { useEffect, useState } from 'react';
import { Api, REMOTE_MCP_URL } from '../api';
import { Callout, Icon } from '../ui';

/**
 * "ChatGPT wants to access your activity — Allow / Deny." Reached via a
 * `?oauth_request=<id>` query param, set by remote-mcp-server's /authorize
 * redirect (see remote-mcp-server/src/oauthProvider.ts). Rendered instead of
 * the normal tab shell, but still behind the same SignIn/Unlock gates in
 * App.tsx — this is a login-required action.
 */

const REMOTE_SCOPES = ['remote:mcp', 'consciousness:summary', 'activity:read', 'activity:search', 'devices:read'];

interface PendingRequest {
  clientName: string;
  scopes: string[];
  redirectUriOrigin: string;
}

export function OAuthConsent({ api, reqId }: { api: Api; reqId: string }) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [remoteAccessEnabled, setRemoteAccessEnabled] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const [reqRes, status] = await Promise.all([
        fetch(`${REMOTE_MCP_URL}/oauth/pending/${reqId}`),
        api.getRemoteAccessStatus(),
      ]);
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.error ?? 'This authorization request was not found or has expired.');
      setPending(reqData);
      setRemoteAccessEnabled(status.enabled);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqId]);

  const allow = async () => {
    setBusy('allow');
    setActionError(null);
    try {
      const created = await api.createIntegration(pending?.clientName ?? 'Remote AI access', REMOTE_SCOPES);
      const res = await fetch(`${REMOTE_MCP_URL}/oauth/pending/${reqId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ integrationToken: created.token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not complete authorization.');
      window.location.href = data.redirectUrl;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const deny = async () => {
    setBusy('deny');
    try {
      const res = await fetch(`${REMOTE_MCP_URL}/oauth/pending/${reqId}/deny`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      window.location.href = res.ok && data.redirectUrl ? data.redirectUrl : '/';
    } catch {
      window.location.href = '/';
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-brand">
          <div className="brand-mark">{Icon.robot({ size: 21 })}</div>
          <h1>Connect an AI tool</h1>
          {pending && <p>{pending.clientName} wants to access your activity</p>}
        </div>

        <div className="auth-card">
          {loadError && <div className="err">{loadError}</div>}

          {pending && remoteAccessEnabled === false && (
            <Callout variant="warn">
              <strong>Remote AI access isn't turned on yet.</strong> Open the desktop app, go to
              AI access, and turn on "Allow remote AI access" first — then come back and try
              again.
            </Callout>
          )}

          {pending && remoteAccessEnabled && (
            <>
              <Callout variant="warn">
                <strong>This is different from a local AI tool.</strong> You already turned on
                remote AI access, so allowing this sends <strong>{pending.clientName}</strong>{' '}
                its own credential to read your activity — decrypted by OneAIMemory's servers on
                your behalf. Your local AI tools (Claude Desktop, Cursor, Kiro) are unaffected.
              </Callout>

              <p className="note" style={{ marginTop: 12 }}>
                Requesting: activity summary, activity history, search, and device status.
              </p>

              {actionError && <div className="err" style={{ marginTop: 12 }}>{actionError}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="ghost" style={{ flex: 1 }} disabled={busy !== null} onClick={() => void deny()}>
                  {busy === 'deny' ? <span className="spinner" /> : 'Deny'}
                </button>
                <button className="primary" style={{ flex: 1 }} disabled={busy !== null} onClick={() => void allow()}>
                  {busy === 'allow' ? <span className="spinner" /> : 'Allow'}
                </button>
              </div>
            </>
          )}

          {pending && remoteAccessEnabled === false && (
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="ghost block" disabled={busy !== null} onClick={() => void deny()}>
                {busy === 'deny' ? <span className="spinner" /> : 'Cancel'}
              </button>
              <button className="ghost" onClick={() => void load()}>
                {Icon.refresh({ size: 15 })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
