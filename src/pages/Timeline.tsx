import { useEffect, useMemo, useState } from 'react';
import type { Api } from '../api';
import { decryptAll, type DataKey, type DecryptedEvent } from '../crypto';
import { EVENT_TYPES, describe, fmtTime } from '../events';
import { Callout, Card, Empty, Icon } from '../ui';

export function Timeline({ api, dataKey }: { api: Api; dataKey: DataKey }) {
  const [type, setType] = useState<string>('');
  const [events, setEvents] = useState<DecryptedEvent[]>([]);
  const [failed, setFailed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<{ totalEvents: number; breakdown: Record<string, number>; devices: Array<{ lastSync: string | null; active: boolean }> } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, st] = await Promise.all([
        api.events({ limit: 300, types: type ? [type] : undefined }),
        api.status().catch(() => null as unknown as typeof status),
      ]);
      const { events: decrypted, failed: n } = await decryptAll(page.events, dataKey);
      setEvents(decrypted);
      setFailed(n);
      if (st) setStatus(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Search runs here, over already-decrypted events — the server holds only
  // ciphertext and cannot filter on content.
  const shown = useMemo(() => {
    if (!query) return events;
    const q = query.toLowerCase();
    return events.filter((e) => JSON.stringify(e.payload).toLowerCase().includes(q));
  }, [events, query]);

  // Group by day so a long list stays navigable.
  const grouped = useMemo(() => {
    const map = new Map<string, DecryptedEvent[]>();
    for (const ev of shown) {
      const d = new Date(ev.timestamp);
      const today = new Date().toDateString() === d.toDateString();
      const yesterday = new Date(Date.now() - 86400_000).toDateString() === d.toDateString();
      const label = today
        ? 'Today'
        : yesterday
          ? 'Yesterday'
          : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      (map.get(label) ?? map.set(label, []).get(label)!).push(ev);
    }
    return [...map.entries()];
  }, [shown]);

  const remove = async (uuid: string) => {
    await api.deleteEvents([uuid]);
    setEvents((prev) => prev.filter((e) => e.eventUuid !== uuid));
  };

  const todayStr = new Date().toDateString();
  const capturedToday = events.filter((e) => new Date(e.timestamp).toDateString() === todayStr).length;
  const activeDevices = status?.devices.filter((d) => d.active).length ?? 0;
  const lastSync = status?.devices.map((d) => d.lastSync).filter(Boolean).sort().at(-1) ?? null;
  const topEntry = status ? Object.entries(status.breakdown).sort((a, b) => b[1] - a[1])[0] : undefined;
  const lastSyncAgo = lastSync
    ? (() => {
        const s = Math.round((Date.now() - Date.parse(lastSync as string)) / 60000);
        if (s < 1) return 'just now';
        if (s < 60) return `${s}m ago`;
        if (s < 1440) return `${Math.round(s / 60)}h ago`;
        return `${Math.round(s / 1440)}d ago`;
      })()
    : '—';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginBottom: 10, fontSize: 11, color: 'var(--ink-4)' }}>
        <span style={{ fontFamily: 'var(--mono)', letterSpacing: '0.02em' }}>decrypted locally</span>
        <button className="ghost" onClick={() => void load()} disabled={loading} title="Refresh" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '6px 14px' }}>
          {loading ? <span className="spinner" /> : 'Refresh'}
        </button>
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#22d3ee', fontWeight: 600, fontFamily: 'var(--mono)', marginBottom: 6 }}>PERSONAL MEMORY</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 750, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>Your timeline</h1>
            <p style={{ margin: '8px 0 0', color: 'var(--ink-3)', fontSize: 13.5 }}>Real activity from your connected devices, decrypted in this browser.</p>
          </div>
          <span className="badge ok" style={{ alignSelf: 'center', fontSize: 11, letterSpacing: '0.02em' }}><span className="dot" /> encrypted &amp; synced</span>
        </div>
      </div>

      <div className="kpi" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
        <div className="tile" style={{ padding: '16px 18px' }}>
          <div className="tile-label">Total memories</div>
          <div className="tile-value" style={{ fontSize: 28 }}>{status ? status.totalEvents.toLocaleString() : loading ? '—' : events.length.toLocaleString()}</div>
          <div className="tile-sub">all time</div>
        </div>
        <div className="tile" style={{ padding: '16px 18px' }}>
          <div className="tile-label">Captured today</div>
          <div className="tile-value" style={{ fontSize: 28 }}>{loading ? '—' : capturedToday}</div>
          <div className="tile-sub">decrypted events</div>
        </div>
        <div className="tile" style={{ padding: '16px 18px' }}>
          <div className="tile-label">Active devices</div>
          <div className="tile-value" style={{ fontSize: 28 }}>{status ? activeDevices : '—'}</div>
          <div className="tile-sub">last sync {lastSyncAgo}</div>
        </div>
        <div className="tile" style={{ padding: '16px 18px' }}>
          <div className="tile-label">Top activity</div>
          <div className="tile-value" style={{ fontSize: 22, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topEntry ? topEntry[0] : '—'}</div>
          <div className="tile-sub">by event count</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search" style={{ flex: '1 1 240px' }}>
          {Icon.search({ size: 14 })}
          <input
            type="text"
            placeholder="Search your activity…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="segmented">
          <button className={type === '' ? 'on' : ''} onClick={() => setType('')}>All</button>
          {EVENT_TYPES.map((t) => (
            <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {failed > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout variant="warn">
            {failed} events could not be decrypted. Another device may be using a different passphrase.
          </Callout>
        </div>
      )}

      {error && <div className="err" style={{ marginBottom: 16 }}>{error}</div>}

      {shown.length === 0 && !loading ? (
        <Card flush>
          <Empty
            title={query ? `No activity matching “${query}”` : 'Nothing recorded yet'}
            hint={
              query
                ? 'Try a different term, or widen the type filter.'
                : 'Browse a page or switch apps — events appear within about 10 seconds.'
            }
          />
        </Card>
      ) : (
        grouped.map(([day, items]) => (
          <Card key={day} title={day} subtitle={`${items.length} event${items.length === 1 ? '' : 's'}`} flush>
            <div className="feed">
              {items.map((ev) => {
                const { main, meta } = describe(ev);
                const letter = ev.type === 'youtube' ? 'Y' : ev.type === 'browsing' ? 'B' : ev.type.slice(0, 1).toUpperCase();
                return (
                  <div className="event" key={ev.eventUuid}>
                    <div className="event-icon" title={ev.type} style={{ fontSize: 11, fontWeight: 650 }}>{letter}</div>
                    <div className="event-body">
                      <div className="event-title" title={main} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--ink-4)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>{ev.type}</span>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{main}</span>
                      </div>
                      {meta && <div className="event-meta" title={meta}>{meta}</div>}
                    </div>
                    <div className="event-time">{fmtTime(ev.timestamp)}</div>
                    <button
                      className="event-del"
                      title="Delete this event"
                      aria-label="Delete this event"
                      onClick={() => void remove(ev.eventUuid)}
                    >
                      {Icon.trash({ size: 14 })}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      {shown.length > 0 && (
        <p className="note" style={{ textAlign: 'center' }}>
          Showing {shown.length} of {events.length} loaded events.
        </p>
      )}
    </>
  );
}
