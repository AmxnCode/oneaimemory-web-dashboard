import type { DecryptedEvent } from './crypto';

export const EVENT_TYPES = ['browsing', 'search', 'youtube', 'file', 'app', 'code'] as const;

/**
 * Render an event the way the user should see it — the exact stored values.
 * This is the "what do you have on me" view, so it deliberately does not
 * paraphrase or redact further.
 */
export function describe(ev: DecryptedEvent): { main: string; meta: string } {
  const p = ev.payload as Record<string, string | number | undefined>;
  const join = (...parts: Array<string | number | undefined>) =>
    parts.filter(Boolean).join(' · ');

  switch (ev.type) {
    case 'browsing':
      return { main: String(p.title || p.domain || 'Untitled page'), meta: String(p.url ?? '') };
    case 'search':
      return { main: `"${p.query ?? ''}"`, meta: join(p.engine, p.url) };
    case 'youtube':
      return { main: String(p.title ?? 'Video'), meta: join(p.channel, p.url) };
    case 'app':
      return {
        main: String(p.name ?? ''),
        meta: join(p.bundleId, p.durationMs ? `${Math.round(Number(p.durationMs) / 60000)} min` : undefined),
      };
    case 'code':
      return { main: String(p.file ?? '(file)'), meta: join(p.project, p.language, p.editor) };
    case 'file':
      return { main: String(p.name ?? ''), meta: String(p.path ?? '') };
    default:
      return { main: ev.type, meta: JSON.stringify(p) };
  }
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtAgo(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was','were',
  'be','how','what','why','when','where','which','who','can','do','does','did','i','my','me',
  'you','your','it','its','this','that','from','by','as','if','not','no','vs','best','top',
  'free','online','download','tutorial','example','guide','error','fix','use','using','get','new',
]);

const GENERIC_DOMAINS = new Set([
  'google.com','www.google.com','duckduckgo.com','bing.com','localhost','127.0.0.1',
  'mail.google.com','t.co','bit.ly',
]);

/**
 * Same recency-weighted heuristic the MCP server uses (~7-day half-life).
 * Kept in sync deliberately so the dashboard and the AI agree on what your
 * interests are.
 */
export function topInterests(events: DecryptedEvent[], limit = 15): Array<{ topic: string; weight: number }> {
  const scores = new Map<string, number>();
  const now = Date.now();

  const bump = (k: string, w: number) => scores.set(k, (scores.get(k) ?? 0) + w);
  const tokens = (t: string) =>
    t.toLowerCase().split(/[^a-z0-9+#.]+/)
      .map((x) => x.replace(/^\.+|\.+$/g, ''))
      .filter((x) => x.length > 2 && x.length < 30 && !STOPWORDS.has(x) && !/^\d+$/.test(x));

  for (const ev of events) {
    const recency = Math.exp(-Math.max(0, (now - Date.parse(ev.timestamp)) / 86400_000) / 7);
    const p = ev.payload as Record<string, string | undefined>;

    if (ev.type === 'search' && p.query) tokens(p.query).forEach((t) => bump(t, 3 * recency));
    else if (ev.type === 'browsing') {
      if (p.domain && !GENERIC_DOMAINS.has(p.domain)) bump(p.domain, 1 * recency);
      if (p.title) tokens(p.title).slice(0, 6).forEach((t) => bump(t, 0.5 * recency));
    } else if (ev.type === 'code') {
      if (p.language) bump(p.language, 3 * recency);
      if (p.project) bump(p.project, 2 * recency);
    } else if (ev.type === 'youtube' && p.title) {
      tokens(p.title).slice(0, 6).forEach((t) => bump(t, 1 * recency));
    }
  }

  return [...scores.entries()]
    .filter(([, w]) => w >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, weight]) => ({ topic, weight: Math.round(weight * 100) / 100 }));
}

export function hourHistogram(events: DecryptedEvent[]): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const ev of events) buckets[new Date(ev.timestamp).getHours()]!++;
  return buckets;
}

export function appMinutes(events: DecryptedEvent[], limit = 8): Array<{ name: string; minutes: number }> {
  const totals = new Map<string, number>();
  for (const ev of events) {
    if (ev.type !== 'app') continue;
    const p = ev.payload as { name?: string; durationMs?: number };
    if (!p.name) continue;
    totals.set(p.name, (totals.get(p.name) ?? 0) + (p.durationMs ?? 0));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, ms]) => ({ name, minutes: Math.round(ms / 60000) }));
}
