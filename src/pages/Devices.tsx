import { useEffect, useState } from 'react';
import type { Api } from '../api';
import { fmtAgo } from '../events';
import { PageHead } from '../App';
import { Card, Empty, Icon } from '../ui';

interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  lastSync: string | null;
  active: boolean;
}

/** Fresh within 10 minutes reads as healthy; older is worth noticing. */
function syncHealth(lastSync: string | null): 'ok' | 'warn' | 'none' {
  if (!lastSync) return 'none';
  return Date.now() - Date.parse(lastSync) < 10 * 60_000 ? 'ok' : 'warn';
}

export function Devices({ api }: { api: Api }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setDevices((await api.devices()).devices);
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

  const unpair = async (d: Device) => {
    if (
      !confirm(
        `Unpair “${d.deviceName}”?\n\nIt stops syncing new activity. Already-synced events stay — delete those from Privacy.`,
      )
    )
      return;
    await api.removeDevice(d.deviceId);
    void load();
  };

  const active = devices.filter((d) => d.active);
  const inactive = devices.filter((d) => !d.active);

  return (
    <>
      <PageHead
        title="Devices"
        subtitle="Machines syncing into your consciousness."
        actions={
          <button className="ghost" onClick={() => void load()} disabled={loading} title="Refresh">
            {loading ? <span className="spinner" /> : Icon.refresh({ size: 15 })}
          </button>
        }
      />

      {error && <div className="err" style={{ marginBottom: 16 }}>{error}</div>}

      <Card title="Paired" subtitle={`${active.length} active`} flush>
        {active.length === 0 ? (
          <Empty title="No devices paired" hint="Sign in from the desktop app to pair this machine." />
        ) : (
          active.map((d) => {
            const health = syncHealth(d.lastSync);
            return (
              <div className="list-row" key={d.deviceId}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                  <div className="event-icon">{Icon.devices({ size: 14 })}</div>
                  <div style={{ minWidth: 0 }}>
                    <strong>{d.deviceName}</strong>
                    <div className="meta mono">{d.deviceType} · {d.deviceId}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className={`badge ${health === 'ok' ? 'ok' : health === 'warn' ? 'warn' : ''}`}>
                    <span className="dot" />
                    {d.lastSync ? fmtAgo(d.lastSync) : 'never synced'}
                  </span>
                  <button className="danger sm" onClick={() => void unpair(d)}>
                    Unpair
                  </button>
                </div>
              </div>
            );
          })
        )}
      </Card>

      {inactive.length > 0 && (
        <Card title="Unpaired" subtitle="No longer syncing; their past events remain" flush>
          {inactive.map((d) => (
            <div className="list-row" key={d.deviceId}>
              <div>
                <strong className="muted">{d.deviceName}</strong>
                <div className="meta mono">{d.deviceType} · last sync {fmtAgo(d.lastSync)}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
