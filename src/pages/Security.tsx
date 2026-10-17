import { useEffect, useState } from 'react';
import type { Api } from '../api';
import type { DataKey } from '../crypto';
import { fmtAgo } from '../events';
import { PageHead } from '../App';
import { Callout, Card, Empty, Icon } from '../ui';
import {
  createPasskey,
  platformAuthenticatorAvailable,
  wrapDataKey,
  PRF_SALT_ID,
  type PublicKeyCredentialCreationOptionsJSON,
} from '../webauthn';

interface Passkey {
  id: number;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
  canUnlock: boolean;
}

export function Security({ api, dataKey }: { api: Api; dataKey: DataKey }) {
  const [items, setItems] = useState<Passkey[]>([]);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      setItems((await api.passkeys()).passkeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
    void platformAuthenticatorAvailable().then(setAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enrol = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const options = (await api.passkeyRegisterOptions()) as unknown as PublicKeyCredentialCreationOptionsJSON & {
        challenge: string;
      };
      const { response, prfOutput } = await createPasskey(options);

      // Wrap the data key with the PRF secret so future sign-ins can unlock
      // without the passphrase. The server receives ciphertext only.
      let wrapped: { wrappedKey: string; wrappedKeyIv: string } | null = null;
      if (prfOutput) wrapped = await wrapDataKey(dataKey.raw, prfOutput);

      const label =
        prompt('Name this passkey', navigator.platform || 'This device')?.trim() || 'This device';

      const saved = await api.passkeyRegisterVerify({
        response,
        challenge: options.challenge,
        deviceLabel: label,
        ...(wrapped ? { prfSalt: PRF_SALT_ID, ...wrapped } : {}),
      });

      setNotice(
        saved.canUnlock
          ? 'Passkey added. Sign-in and unlock are now a single biometric prompt.'
          : 'Passkey added for sign-in. This authenticator does not support PRF, so you will still be asked for your passphrase.',
      );
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/cancel|NotAllowed/i.test(msg) ? 'Passkey setup was cancelled.' : msg);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Passkey) => {
    if (
      !confirm(
        `Remove “${p.deviceLabel}”?\n\nThat device will need your password and passphrase again. Your data is unaffected.`,
      )
    )
      return;
    await api.deletePasskey(p.id);
    void load();
  };

  return (
    <>
      <PageHead title="Security" subtitle="How you sign in and unlock your data." />

      <div style={{ marginBottom: 16 }}>
        <Callout>
          <strong>A passkey replaces two things at once.</strong> The signature proves who you are,
          and — where the authenticator supports it — a secret derived on-device unwraps your data
          key in the same prompt. That secret never leaves this machine, so the server still cannot
          read your activity.
        </Callout>
      </div>

      {!available && (
        <div style={{ marginBottom: 16 }}>
          <Callout variant="warn">
            No biometric authenticator detected in this browser. Passkeys need Touch ID, Windows
            Hello, or a security key.
          </Callout>
        </div>
      )}

      <Card
        title="Passkeys"
        subtitle={`${items.length} registered`}
        actions={
          <button className="primary" onClick={() => void enrol()} disabled={busy || !available}>
            {busy ? <span className="spinner" /> : Icon.fingerprint({ size: 14 })}
            {busy ? ' Waiting…' : ' Add passkey'}
          </button>
        }
        flush
      >
        {items.length === 0 ? (
          <Empty
            icon={Icon.fingerprint({ size: 26 })}
            title="No passkeys yet"
            hint="Add one to sign in with Touch ID instead of typing two secrets."
          />
        ) : (
          items.map((p) => (
            <div className="list-row" key={p.id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <div className="event-icon">{Icon.fingerprint({ size: 14 })}</div>
                <div style={{ minWidth: 0 }}>
                  <strong>{p.deviceLabel}</strong>
                  <div className="meta">
                    added {fmtAgo(p.createdAt)} · last used{' '}
                    {p.lastUsedAt ? fmtAgo(p.lastUsedAt) : 'never'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {p.canUnlock ? (
                  <span className="badge ok" title="Signs in and unlocks your data in one prompt">
                    <span className="dot" /> unlocks data
                  </span>
                ) : (
                  <span className="badge" title="Signs in only; passphrase still required">
                    sign-in only
                  </span>
                )}
                {p.backedUp && <span className="badge">synced</span>}
                <button className="danger sm" onClick={() => void remove(p)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      {notice && <div className="callout" style={{ marginBottom: 16 }}>{Icon.info({ size: 15 })}<div>{notice}</div></div>}
      {error && <div className="err">{error}</div>}

      <Card title="What a passkey does not change">
        <p className="note" style={{ marginTop: 0 }}>
          Your passphrase remains the root of your encryption. A passkey stores a{' '}
          <em>wrapped copy</em> of the derived key — it does not replace or escrow the passphrase.
          Keep it somewhere safe: if you lose every passkey and the passphrase, your synced
          activity is permanently unreadable. That is the cost of the server holding no keys.
        </p>
      </Card>
    </>
  );
}
