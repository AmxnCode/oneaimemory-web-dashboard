import { useEffect, useState } from 'react';
import type { Api } from '../api';
import { decryptAll, type DataKey, type DecryptedEvent } from '../crypto';
import { appMinutes, hourHistogram, topInterests } from '../events';
import { PageHead } from '../App';
import { Bar, Card, Empty, Tile } from '../ui';

/**
 * Every chart here answers "compare magnitude", so each is a SINGLE-HUE
 * comparison rather than a categorical palette. The categories (event types,
 * topics, apps) are nominal — a darker-where-bigger ramp would double-encode
 * bar length as color and burn the only free channel on information the bar
 * already shows.
 */
export function Analytics({ api, dataKey }: { api: Api; dataKey: DataKey }) {
  const [events, setEvents] = useState<DecryptedEvent[]>([]);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [page, status] = await Promise.all([api.events({ limit: 500 }), api.status()]);
        const { events: decrypted } = await decryptAll(page.events, dataKey);
        if (cancelled) return;
        setEvents(decrypted);
        setBreakdown(status.breakdown);
        setTotal(status.totalEvents);
        setDeviceCount(status.devices.filter((d) => d.active).length);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, dataKey]);

  if (loading) {
    return (
      <>
        <PageHead title="Analytics" />
        <Card>
          <div className="note">
            <span className="spinner" /> Decrypting {'…'}
          </div>
        </Card>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHead title="Analytics" />
        <div className="err">{error}</div>
      </>
    );
  }

  const interests = topInterests(events, 10);
  const hours = hourHistogram(events);
  const apps = appMinutes(events);
  const maxHour = Math.max(...hours, 1);
  const typeMax = Math.max(...Object.values(breakdown), 1);
  const activeHours = hours.filter((n) => n > 0).length;
  const peakHour = hours.indexOf(maxHour);
  const totalMinutes = apps.reduce((sum, a) => sum + a.minutes, 0);

  const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

  return (
    <>
      <PageHead title="Analytics" subtitle="Computed in this tab from decrypted events." />

      <div className="kpi">
        <Tile label="Events stored" value={total.toLocaleString()} sub="all time, all devices" />
        <Tile label="Active devices" value={deviceCount} sub="syncing now" />
        <Tile label="Topics found" value={interests.length} sub="recency-weighted" />
        <Tile
          label="Tracked time"
          value={totalMinutes >= 60 ? `${(totalMinutes / 60).toFixed(1)}h` : `${totalMinutes}m`}
          sub="in the loaded window"
        />
      </div>

      <Card title="Event mix" subtitle="Across everything stored on the server">
        {Object.keys(breakdown).length === 0 ? (
          <Empty title="No events yet" />
        ) : (
          <div className="chart">
            {Object.entries(breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([type, n]) => (
                <Bar
                  key={type}
                  name={type}
                  value={n}
                  max={typeMax}
                  display={n.toLocaleString()}
                  tip={`${n.toLocaleString()} ${type} events`}
                />
              ))}
          </div>
        )}
      </Card>

      <Card
        title="Top interests"
        subtitle="Frequency with a ~7-day half-life — the same calculation the MCP server gives AI models"
      >
        {interests.length === 0 ? (
          <Empty title="Not enough activity yet" hint="Interests appear once there are searches or code events to weigh." />
        ) : (
          <>
            <div className="chart">
              {interests.map((i) => (
                <Bar
                  key={i.topic}
                  name={i.topic}
                  value={i.weight}
                  max={interests[0]!.weight}
                  display={i.weight.toFixed(1)}
                  tip={`${i.topic} — weight ${i.weight}`}
                />
              ))}
            </div>
            <p className="note" style={{ marginTop: 14 }}>
              Heuristic, not a language model. These are topics you touched, not conclusions about intent.
            </p>
          </>
        )}
      </Card>

      <Card
        title="When you are active"
        subtitle={`Local time · ${activeHours} active hour${activeHours === 1 ? '' : 's'}, peak at ${fmtHour(peakHour)}`}
      >
        <div className="hours">
          {hours.map((n, h) => (
            <div className="hour" key={h}>
              <span className="tip">
                {fmtHour(h)} — {n} event{n === 1 ? '' : 's'}
              </span>
              {/* Percentage everywhere so every bar resolves against the same
                  box; an empty hour keeps a visible baseline tick. */}
              <div
                className={`hour-bar${n === 0 ? ' is-zero' : ''}`}
                style={{ height: n === 0 ? '2%' : `${Math.max((n / maxHour) * 100, 4)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="hour-axis">
          {hours.map((_, h) => (
            <div className="hour-tick" key={h}>
              {h % 6 === 0 ? fmtHour(h) : ''}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Time in apps" subtitle="From focus duration on your devices">
        {apps.length === 0 ? (
          <Empty title="No app activity recorded" hint="The desktop collector reports focus duration per app." />
        ) : (
          <div className="chart">
            {apps.map((a) => (
              <Bar
                key={a.name}
                name={a.name}
                value={a.minutes}
                max={apps[0]!.minutes}
                display={a.minutes >= 60 ? `${(a.minutes / 60).toFixed(1)}h` : `${a.minutes}m`}
                tip={`${a.name} — ${a.minutes} minutes`}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
