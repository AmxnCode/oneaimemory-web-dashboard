import { useEffect, useMemo, useState } from 'react';
import type { Api } from '../api';
import { fmtTime } from '../events';
import { PageHead } from '../App';
import { Callout, Card, Empty, Icon } from '../ui';

interface Entry {
  id: number;
  action: string;
  integrationLabel: string | null;
  claimedAiModel: string | null;
  claimedAiModelVerified: boolean;
  timestamp: string;
  ipAddress: string | null;
  details: Record<string, unknown> | null;
}

const AI_ACTIONS = new Set(['ai_read_activity', 'ai_read_summary', 'ai_read_devices']);

const ACTION_LABEL: Record<string, string> = {
  ai_read_activity: 'Read your activity',
  ai_read_summary: 'Read your summary',
  ai_read_devices: 'Read device status',
  login: 'Signed in',
  logout: 'Signed out',
  register: 'Account created',
  export: 'Exported data',
  delete_data: 'Deleted data',
  integration_created: 'Token issued',
  integration_revoked: 'Token revoked',
  preferences_updated: 'Preferences changed',
};

export function Audit({ api }: { api: Api }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [onlyAi, setOnlyAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.audit(200);
      setEntries(r.entries as unknown as Entry[]);
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

  const shown = useMemo(
    () => (onlyAi ? entries.filter((e) => AI_ACTIONS.has(e.action)) : entries),
    [entries, onlyAi],
  );
  const aiCount = entries.filter((e) => AI_ACTIONS.has(e.action)).length;

  return (
    <>
      <PageHead
        title="Audit log"
        subtitle="Every read of your data, by you or by an AI."
        actions={
          <button className="ghost" onClick={() => void load()} disabled={loading} title="Refresh">
            {loading ? <span className="spinner" /> : Icon.refresh({ size: 15 })}
          </button>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Callout variant="warn">
          <strong>The model name is self-reported and unverified.</strong> Any client holding a
          token can claim any name. The trustworthy identity is the token label beside it.
        </Callout>
      </div>

      <div className="segmented" style={{ marginBottom: 16 }}>
        <button className={!onlyAi ? 'on' : ''} onClick={() => setOnlyAi(false)}>
          Everything ({entries.length})
        </button>
        <button className={onlyAi ? 'on' : ''} onClick={() => setOnlyAi(true)}>
          AI access ({aiCount})
        </button>
      </div>

      {error && <div className="err" style={{ marginBottom: 16 }}>{error}</div>}

      <Card flush>
        <div className="scroll">
          {shown.length === 0 ? (
            <Empty title={onlyAi ? 'No AI access recorded' : 'Nothing recorded yet'} />
          ) : (
            <div className="feed">
              {shown.map((e) => {
                const isAi = AI_ACTIONS.has(e.action);
                return (
                  <div className="event" key={e.id}>
                    <div className="event-icon" title={isAi ? 'AI' : 'You'}>
                      {isAi ? Icon.robot({ size: 14 }) : Icon.shield({ size: 14 })}
                    </div>
                    <div className="event-body">
                      <div className="event-title">
                        {ACTION_LABEL[e.action] ?? e.action.replace(/_/g, ' ')}
                        {e.details?.returned != null && (
                          <span className="muted" style={{ fontWeight: 400 }}>
                            {' '}— {String(e.details.returned)} events
                          </span>
                        )}
                      </div>
                      <div className="event-meta">
                        {e.integrationLabel ?? 'your session'}
                        {e.claimedAiModel && ` · claims “${e.claimedAiModel}” (unverified)`}
                        {e.ipAddress && ` · ${e.ipAddress}`}
                      </div>
                    </div>
                    <div className="event-time">{fmtTime(e.timestamp)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
