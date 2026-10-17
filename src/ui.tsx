import type { ReactNode } from 'react';

/**
 * Inline SVG only — the page's CSP forbids external origins, and the key lives
 * in this tab's memory, so no third-party asset should ever load here.
 * 16px grid, 1.6 stroke, round caps.
 */

const s = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

type IconProps = { size?: number };
const wrap = (children: ReactNode, size = 16) => (
  <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  logo: ({ size }: IconProps = {}) =>
    wrap(
      <>
        <circle cx="8" cy="8" r="2.1" {...s} />
        <path d="M8 1.4v2.4M8 12.2v2.4M1.4 8h2.4M12.2 8h2.4" {...s} />
        <path d="M3.4 3.4l1.7 1.7M10.9 10.9l1.7 1.7M12.6 3.4l-1.7 1.7M5.1 10.9l-1.7 1.7" {...s} opacity={0.55} />
      </>,
      size,
    ),
  timeline: ({ size }: IconProps = {}) =>
    wrap(<><path d="M5.5 3h8M5.5 8h8M5.5 13h8" {...s} /><circle cx="2.6" cy="3" r="1.1" {...s} /><circle cx="2.6" cy="8" r="1.1" {...s} /><circle cx="2.6" cy="13" r="1.1" {...s} /></>, size),
  chart: ({ size }: IconProps = {}) =>
    wrap(<><path d="M2 13.5h12" {...s} /><path d="M4.2 13.5V8.4M7.4 13.5V4.2M10.6 13.5V6.6M13.8 13.5v-3" {...s} /></>, size),
  devices: ({ size }: IconProps = {}) =>
    wrap(<><rect x="1.5" y="3" width="9" height="7" rx="1.2" {...s} /><path d="M3.6 12.5h5.4" {...s} /><rect x="11.5" y="6" width="3.2" height="7.5" rx="1" {...s} /></>, size),
  shield: ({ size }: IconProps = {}) =>
    wrap(<><path d="M8 1.6l5.2 2v4.1c0 3-2.1 5.7-5.2 6.7-3.1-1-5.2-3.7-5.2-6.7V3.6z" {...s} /><path d="M5.9 7.9l1.5 1.5 2.9-2.9" {...s} /></>, size),
  robot: ({ size }: IconProps = {}) =>
    wrap(<><rect x="2.6" y="5" width="10.8" height="8" rx="2" {...s} /><path d="M8 2.2V5" {...s} /><circle cx="8" cy="2" r="0.9" {...s} /><path d="M6 8.6v1M10 8.6v1" {...s} /></>, size),
  log: ({ size }: IconProps = {}) =>
    wrap(<><rect x="2.5" y="1.8" width="11" height="12.4" rx="1.6" {...s} /><path d="M5.2 5.4h5.6M5.2 8h5.6M5.2 10.6h3.4" {...s} /></>, size),
  search: ({ size }: IconProps = {}) =>
    wrap(<><circle cx="7" cy="7" r="4.6" {...s} /><path d="M10.4 10.4L14 14" {...s} /></>, size),
  globe: ({ size }: IconProps = {}) =>
    wrap(<><circle cx="8" cy="8" r="6.2" {...s} /><path d="M1.8 8h12.4" {...s} /><ellipse cx="8" cy="8" rx="2.6" ry="6.2" {...s} /></>, size),
  play: ({ size }: IconProps = {}) =>
    wrap(<><rect x="1.6" y="3.2" width="12.8" height="9.6" rx="2.2" {...s} /><path d="M6.6 6.3l3.6 1.9-3.6 1.9z" {...s} /></>, size),
  window: ({ size }: IconProps = {}) =>
    wrap(<><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8" {...s} /><path d="M1.8 6h12.4" {...s} /></>, size),
  code: ({ size }: IconProps = {}) =>
    wrap(<><path d="M5.4 5.2L2.4 8l3 2.8M10.6 5.2L13.6 8l-3 2.8M9.2 3.4l-2.4 9.2" {...s} /></>, size),
  file: ({ size }: IconProps = {}) =>
    wrap(<><path d="M9 1.8H4.6a1.6 1.6 0 00-1.6 1.6v9.2a1.6 1.6 0 001.6 1.6h6.8a1.6 1.6 0 001.6-1.6V5.4z" {...s} /><path d="M9 1.8v3.6h3.6" {...s} /></>, size),
  trash: ({ size }: IconProps = {}) =>
    wrap(<><path d="M2.8 4.2h10.4M6 4.2V2.9a.9.9 0 01.9-.9h2.2a.9.9 0 01.9.9v1.3M4.3 4.2l.6 8.6a1.2 1.2 0 001.2 1.1h3.8a1.2 1.2 0 001.2-1.1l.6-8.6" {...s} /></>, size),
  refresh: ({ size }: IconProps = {}) =>
    wrap(<><path d="M13.6 6.8a5.8 5.8 0 10-.5 4.2" {...s} /><path d="M13.9 2.9v3.9H10" {...s} /></>, size),
  download: ({ size }: IconProps = {}) =>
    wrap(<><path d="M8 1.9v8.4M4.8 7.3L8 10.5l3.2-3.2M2.4 13.4h11.2" {...s} /></>, size),
  lock: ({ size }: IconProps = {}) =>
    wrap(<><rect x="3.2" y="7" width="9.6" height="7" rx="1.8" {...s} /><path d="M5.6 7V4.9a2.4 2.4 0 014.8 0V7" {...s} /></>, size),
  info: ({ size }: IconProps = {}) =>
    wrap(<><circle cx="8" cy="8" r="6.3" {...s} /><path d="M8 7.4v3.6" {...s} /><circle cx="8" cy="5.2" r="0.85" fill="currentColor" stroke="none" /></>, size),
  alert: ({ size }: IconProps = {}) =>
    wrap(<><path d="M8 1.9l6.4 11.2H1.6z" {...s} /><path d="M8 6.3v3.2" {...s} /><circle cx="8" cy="11.3" r="0.85" fill="currentColor" stroke="none" /></>, size),
  inbox: ({ size }: IconProps = {}) =>
    wrap(<><path d="M1.9 8.6h3.4l1 1.9h3.4l1-1.9h3.4" {...s} /><path d="M3.4 2.9h9.2l1.5 5.7v3.4a1.6 1.6 0 01-1.6 1.6H3.5a1.6 1.6 0 01-1.6-1.6V8.6z" {...s} /></>, size),
  fingerprint: ({ size }: IconProps = {}) =>
    wrap(
      <>
        <path d="M2.6 6.4a6.4 6.4 0 0110.8-1.9" {...s} />
        <path d="M4.9 8a3.2 3.2 0 016.3-.6" {...s} />
        <path d="M8 8v2.2a3 3 0 003 3" {...s} />
        <path d="M13.6 7.6v1.6a5.6 5.6 0 01-1.4 3.7" {...s} />
        <path d="M5 11.4a5.6 5.6 0 01-.9-3.1" {...s} />
        <path d="M7.6 13.8a3 3 0 01-1.3-.8" {...s} />
      </>,
      size,
    ),
  key: ({ size }: IconProps = {}) =>
    wrap(<><circle cx="5.4" cy="10.6" r="2.9" {...s} /><path d="M7.5 8.5l5.3-5.3M10.6 5.4l1.5 1.5M12.2 3.8l1.5 1.5" {...s} /></>, size),
  logout: ({ size }: IconProps = {}) =>
    wrap(<><path d="M6.2 13.6H3.6A1.6 1.6 0 012 12V4a1.6 1.6 0 011.6-1.6h2.6M10.4 11.2L13.6 8l-3.2-3.2M13.6 8H6.2" {...s} /></>, size),
};

/** Event type → icon. Keeps the timeline scannable without color. */
export const EVENT_ICON: Record<string, (p?: IconProps) => ReactNode> = {
  browsing: Icon.globe,
  search: Icon.search,
  youtube: Icon.play,
  app: Icon.window,
  code: Icon.code,
  file: Icon.file,
};

export function Card({
  title,
  subtitle,
  actions,
  children,
  flush,
  tight,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  tight?: boolean;
}) {
  return (
    <section className="card">
      {title && (
        <header className="card-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="spacer" />
          {actions}
        </header>
      )}
      <div className={`card-body${flush ? ' flush' : ''}${tight ? ' tight' : ''}`}>{children}</div>
    </section>
  );
}

export function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

/**
 * Horizontal magnitude bar. Single hue for every bar — these categories are
 * nominal, and a darker-where-bigger ramp would double-encode length as color.
 */
export function Bar({
  name,
  value,
  max,
  display,
  tip,
}: {
  name: string;
  value: number;
  max: number;
  display?: string;
  tip?: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, 0.8) : 0;
  return (
    <div className="bar-row">
      <div className="bar-name" title={name}>{name}</div>
      <div className="bar-track" style={{ position: 'relative' }}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
        {tip && <span className="tip">{tip}</span>}
      </div>
      <div className="bar-value">{display ?? value}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="switch-row">
      <div className="switch-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
        <span className="slider" />
      </label>
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty">
      {icon ?? Icon.inbox({ size: 26 })}
      <p>{title}</p>
      {hint && <div className="sub">{hint}</div>}
    </div>
  );
}

export function Callout({ children, variant }: { children: ReactNode; variant?: 'warn' }) {
  return (
    <div className={`callout${variant === 'warn' ? ' warn' : ''}`}>
      {variant === 'warn' ? Icon.alert({ size: 15 }) : Icon.info({ size: 15 })}
      <div>{children}</div>
    </div>
  );
}
