import { useEffect, useState } from 'react';
import { Api, DEFAULT_API, loadSession, type Session } from './api';
import { bytesToB64, dataKeyFromRaw, deriveKey, keyFingerprint, type DataKey } from './crypto';
import { assertPasskey, platformAuthenticatorAvailable, unwrapDataKey } from './webauthn';

const STORAGE_KEY = 'oneaimemory.dataKey';
function persistKey(raw: Uint8Array, remember: boolean) {
  const b64 = bytesToB64(raw as Uint8Array<ArrayBuffer>);
  try {
    if (remember) localStorage.setItem(STORAGE_KEY, b64);
    else sessionStorage.setItem(STORAGE_KEY, b64);
    if (remember) sessionStorage.removeItem(STORAGE_KEY); else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
function clearPersistedKey() { try { localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(STORAGE_KEY); } catch {} }
async function loadPersistedKey(session: Session | null): Promise<DataKey | null> {
  if (!session) return null;
  try {
    const b64 = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!b64) return null;
    const { b64ToBytes } = await import('./crypto');
    const raw = b64ToBytes(b64);
    const k = await dataKeyFromRaw(raw);
    if (session.keyFingerprint && (await keyFingerprint(k)) !== session.keyFingerprint) return null;
    return k;
  } catch { return null; }
}
import { Icon } from './ui';
import { Timeline } from './pages/Timeline';
import { Analytics } from './pages/Analytics';
import { Devices } from './pages/Devices';
import { Privacy } from './pages/Privacy';
import { Security } from './pages/Security';
import { AiAccess } from './pages/AiAccess';
import { Audit } from './pages/Audit';
import { OAuthConsent } from './pages/OAuthConsent';
import { Landing } from './pages/Landing';

const NAV = [
  { id: 'landing', label: 'Landing', icon: ({ size }: { size?: number }) => <span style={{ fontSize: size ?? 16 }}>◉</span> },
  { id: 'timeline', label: 'Timeline', icon: Icon.timeline },
  { id: 'analytics', label: 'Analytics', icon: Icon.chart },
  { id: 'devices', label: 'Devices', icon: Icon.devices },
  { id: 'privacy', label: 'Privacy', icon: Icon.shield },
  { id: 'security', label: 'Security', icon: Icon.fingerprint },
  { id: 'ai', label: 'AI access', icon: Icon.robot },
  { id: 'audit', label: 'Audit log', icon: Icon.log },
] as const;

type Tab = (typeof NAV)[number]['id'];

export function App() {
  const [api] = useState(() => new Api());
  const [session, setSession] = useState<Session | null>(loadSession);
  const [key, setKey] = useState<DataKey | null>(null);
  const [tab, setTab] = useState<Tab>('timeline');

  useEffect(() => {
    if (session && !key) {
      void loadPersistedKey(session).then((k) => { if (k) setKey(k); });
    }
  }, [session]);
  // Set once at mount: an OAuth redirect always lands on a fresh page load,
  // so this never needs to react to later URL changes.
  const [oauthRequestId] = useState(() => new URLSearchParams(window.location.search).get('oauth_request'));

  if (!session) {
    return (
      <SignIn
        api={api}
        onSignedIn={setSession}
        onUnlockedByPasskey={(s, k) => {
          persistKey(k.raw, true);
          setSession(s);
          setKey(k);
        }}
      />
    );
  }

  // Authorizing a remote AI tool only needs the login session — it mints an
  // integration token, the same thing the desktop app already does, and
  // never touches the data key. Checked before the Unlock gate on purpose:
  // no reason to force a passphrase/scrypt round trip for an action that
  // doesn't need it.
  if (oauthRequestId) {
    return <OAuthConsent api={api} reqId={oauthRequestId} />;
  }

  // Signed in but locked: key is persisted if user chose "Remember" (localStorage) or sessionStorage for tab lifetime
  if (!key) {
    return (
      <Unlock
        session={session}
        onUnlocked={(k, remember) => { persistKey(k.raw, remember); setKey(k); }}
        onSignOut={() => {
          api.logout();
          clearPersistedKey();
          setSession(null);
        }}
      />
    );
  }

  const signOut = () => {
    api.logout();
    clearPersistedKey();
    setKey(null);
    setSession(null);
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-mark">{Icon.logo({ size: 15 })}</div>
          <div>
            <div className="brand-name">OneAIMemory</div>
            <div className="brand-sub">Your context</div>
          </div>
        </div>

        <div className="nav-label">Workspace</div>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item${tab === item.id ? ' active' : ''}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            {item.icon({ size: 16 })}
            {item.label}
          </button>
        ))}

        <div className="sidebar-foot">
          <div className="account">
            <div className="avatar">{session.email.slice(0, 1).toUpperCase()}</div>
            <span className="account-email" title={session.email}>{session.email}</span>
          </div>
          <button className="nav-item" onClick={signOut}>
            {Icon.logout({ size: 16 })}
            Sign out
          </button>
        </div>
      </nav>

      <main className="main">
        <div className="main-inner">
          {tab === 'landing' && <Landing />}
        {tab === 'timeline' && <Timeline api={api} dataKey={key} />}
          {tab === 'analytics' && <Analytics api={api} dataKey={key} />}
          {tab === 'devices' && <Devices api={api} />}
          {tab === 'privacy' && <Privacy api={api} dataKey={key} />}
          {tab === 'security' && <Security api={api} dataKey={key} />}
          {tab === 'ai' && <AiAccess api={api} />}
          {tab === 'audit' && <Audit api={api} />}
        </div>
      </main>
    </div>
  );
}

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="spacer" />
      {actions}
    </header>
  );
}

function SignIn({
  api,
  onSignedIn,
  onUnlockedByPasskey,
}: {
  api: Api;
  onSignedIn: (s: Session) => void;
  onUnlockedByPasskey: (s: Session, k: DataKey) => void;
}) {
  // Not user-editable — the app already knows its own backend (see api.ts).
  const apiUrl = DEFAULT_API;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'passkey' | null>(null);
  const [error, setError] = useState('');
  const [hasPlatform, setHasPlatform] = useState(false);

  useEffect(() => {
    void platformAuthenticatorAvailable().then(setHasPlatform);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('password');
    setError('');
    try {
      onSignedIn(await api.login(apiUrl.replace(/\/+$/, ''), email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  /**
   * One biometric prompt does both jobs: the signature authenticates, and the
   * PRF secret unwraps the data key — so a passkey user skips the unlock step
   * entirely, without the server ever holding the key.
   */
  const signInWithPasskey = async () => {
    setBusy('passkey');
    setError('');
    const base = apiUrl.replace(/\/+$/, '');
    try {
      const options = await api.passkeyLoginOptions(base);
      const { response, prfOutput } = await assertPasskey(options.challenge);
      const result = await api.passkeyLoginVerify(base, { response, challenge: options.challenge });
      const session: Session = { ...result, apiUrl: base };

      if (prfOutput && result.wrappedKey && result.wrappedKeyIv) {
        const raw = await unwrapDataKey(result.wrappedKey, result.wrappedKeyIv, prfOutput);
        const key = await dataKeyFromRaw(raw);
        // Confirm this really is the account's key before trusting it.
        if (!session.keyFingerprint || (await keyFingerprint(key)) === session.keyFingerprint) {
          onUnlockedByPasskey(session, key);
          return;
        }
      }
      // Authenticated, but no usable wrapped key — fall through to the
      // passphrase prompt rather than failing the sign-in.
      onSignedIn(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/cancel|NotAllowed/i.test(msg) ? 'Passkey prompt was cancelled.' : msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-brand">
          <div className="brand-mark">{Icon.logo({ size: 21 })}</div>
          <h1>OneAIMemory</h1>
          <p>Sign in to your dashboard</p>
        </div>

        <form className="auth-card" onSubmit={submit}>
          {hasPlatform && (
            <>
              <button
                type="button"
                className="primary"
                style={{ width: '100%', marginTop: 0, marginBottom: 4 }}
                disabled={busy !== null}
                onClick={() => void signInWithPasskey()}
              >
                {busy === 'passkey' ? <span className="spinner" /> : Icon.fingerprint({ size: 15 })}
                {busy === 'passkey' ? ' Waiting for biometrics…' : ' Sign in with passkey'}
              </button>
              <div className="divider"><span>or use your password</span></div>
            </>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="username webauthn"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Account password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy !== null || !email || !password}>
            {busy === 'password' ? <span className="spinner" /> : 'Continue'}
          </button>
          {error && <div className="err">{error}</div>}
        </form>

        <p className="note auth-foot">
          Accounts are created in the desktop app. This dashboard reads and
          controls your data — it does not collect any.
        </p>
      </div>
    </div>
  );
}

function Unlock({
  session,
  onUnlocked,
  onSignOut,
}: {
  session: Session;
  onUnlocked: (k: DataKey, remember: boolean) => void;
  onSignOut: () => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // scrypt takes ~1s; yield first so the spinner paints.
      await new Promise((r) => setTimeout(r, 20));
      const key = await deriveKey(passphrase, session.dataKeySalt);

      // Fail fast rather than after downloading events we cannot read.
      if (session.keyFingerprint) {
        const fp = await keyFingerprint(key);
        if (fp !== session.keyFingerprint) {
          setError('Wrong passphrase — that key does not match your other devices.');
          return;
        }
      }
      onUnlocked(key, remember);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-brand">
          <div className="brand-mark">{Icon.lock({ size: 21 })}</div>
          <h1>Unlock your data</h1>
          <p>{session.email}</p>
        </div>

        <form className="auth-card" onSubmit={submit}>
          <label className="field">
            <span>Encryption passphrase</span>
            <input
              type="password"
              value={passphrase}
              autoFocus
              autoComplete="off"
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <div className="hint">
              Not your account password — the separate passphrase you set in the desktop app.
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device (stay unlocked)
          </label>
          <button className="primary" disabled={busy || !passphrase}>
            {busy ? (
              <>
                <span className="spinner" /> Deriving key…
              </>
            ) : (
              'Unlock'
            )}
          </button>
          {error && <div className="err">{error}</div>}
        </form>

        <p className="note auth-foot">
          {remember ? 'Stored locally on this device (never sent to server) — clear via Sign out.' : 'Used only in this tab. Never sent to the server.'}
        </p>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button className="ghost sm" onClick={onSignOut}>
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
