import { useEffect, useState } from 'react';
import type { Api } from '../api';
import { fmtAgo } from '../events';
import { PageHead } from '../App';
import { Callout, Card, Empty, Icon } from '../ui';

interface Integration {
  id: number;
  label: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const SCOPE_LABEL: Record<string, string> = {
  'consciousness:summary': 'Summary',
  'activity:read': 'Read activity',
  'activity:search': 'Search',
  'devices:read': 'Devices',
};

export function AiAccess({ api }: { api: Api }) {
  const [items, setItems] = useState<Integration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems((await api.integrations()).integrations);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = items.filter((i) => !i.revoked_at);
  const revoked = items.filter((i) => i.revoked_at);

  return (
    <>
      <PageHead
        title="AI access"
        subtitle="Which tools can read your consciousness."
        actions={
          <button className="ghost" onClick={() => void load()} disabled={loading} title="Refresh">
            {loading ? <span className="spinner" /> : Icon.refresh({ size: 15 })}
          </button>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Callout>
          <strong>Access binds to a token, not to a model name.</strong> An MCP server
          authenticates the credential it is handed — it cannot verify which model is calling, and
          “I am Claude” is a string any client can send. Revoking the token is the only real
          revocation. Tokens are issued in the desktop app, under AI access.
        </Callout>
      </div>

      {error && <div className="err" style={{ marginBottom: 16 }}>{error}</div>}

      <Card title="Active tokens" subtitle={`${live.length} in use`} flush>
        {live.length === 0 ? (
          <Empty
            title="No active tokens"
            hint="Generate one from the desktop app to connect Claude or another MCP client."
          />
        ) : (
          live.map((i) => (
            <div className="list-row" key={i.id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <div className="event-icon">{Icon.robot({ size: 14 })}</div>
                <div style={{ minWidth: 0 }}>
                  <strong>{i.label}</strong>
                  <div className="meta">
                    {i.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(' · ')}
                  </div>
                  <div className="meta">
                    created {fmtAgo(i.created_at)} · last used{' '}
                    {i.last_used_at ? fmtAgo(i.last_used_at) : 'never'}
                  </div>
                </div>
              </div>
              <button
                className="danger sm"
                onClick={async () => {
                  if (!confirm(`Revoke “${i.label}”?\n\nAny AI tool using it loses access immediately.`)) return;
                  await api.revokeIntegration(i.id);
                  void load();
                }}
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </Card>

      {revoked.length > 0 && (
        <Card title="Revoked" flush>
          {revoked.map((i) => (
            <div className="list-row" key={i.id}>
              <div>
                <strong className="muted">{i.label}</strong>
                <div className="meta">revoked {fmtAgo(i.revoked_at)}</div>
              </div>
              <span className="badge">inactive</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
