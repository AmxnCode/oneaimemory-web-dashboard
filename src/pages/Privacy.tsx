import { useEffect, useState } from 'react';
import type { Api } from '../api';
import { decryptAll, type DataKey } from '../crypto';
import { PageHead } from '../App';
import { Callout, Card, Icon, Switch } from '../ui';

const TOGGLES: Array<{ key: string; label: string; desc: string }> = [
  { key: 'collection_enabled', label: 'Collection enabled', desc: 'Master switch for every device' },
  { key: 'collect_browsing', label: 'Browsing', desc: 'Page URLs and titles' },
  { key: 'collect_searches', label: 'Search queries', desc: 'Terms parsed from search URLs' },
  { key: 'collect_youtube', label: 'YouTube', desc: 'Videos you watch' },
  { key: 'collect_apps', label: 'Apps', desc: 'Which app is focused, and for how long' },
  { key: 'collect_code_activity', label: 'Editor activity', desc: 'File, language and project' },
  { key: 'collect_files', label: 'File access', desc: 'Documents opened outside an editor' },
];

export function Privacy({ api, dataKey }: { api: Api; dataKey: DataKey }) {
  const [prefs, setPrefs] = useState<Record<string, number | string>>({});
  const [blocks, setBlocks] = useState<Array<{ pattern_type: string; pattern: string }>>([]);
  const [newPattern, setNewPattern] = useState('');
  const [newType, setNewType] = useState('domain');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await api.preferences();
    setPrefs(r.preferences);
    setBlocks(r.blockedPatterns);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (key: string, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value ? 1 : 0 }));
    await api.updatePreferences({ [key]: value });
  };

  const addBlock = async () => {
    const pattern = newPattern.trim().toLowerCase();
    if (!pattern) return;
    await api.addBlock(newType, pattern);
    setNewPattern('');
    void load();
  };

  /**
   * Export decrypts locally so the file is readable. The server's /export
   * returns ciphertext — it has nothing else to give.
   */
  const exportData = async () => {
    setBusy(true);
    setMsg('');
    try {
      const raw = (await api.exportRaw()) as { events: never[]; [k: string]: unknown };
      const { events } = await decryptAll(raw.events, dataKey);
      const blob = new Blob(
        [JSON.stringify({ ...raw, events, note: 'Decrypted client-side for portability.' }, null, 2)],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oneconscious-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Exported ${events.length} decrypted events.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteAll = async () => {
    const typed = prompt('This permanently deletes ALL your synced activity.\n\nType DELETE to confirm.');
    if (typed !== 'DELETE') return;
    const r = await api.deleteAllEvents();
    setMsg(`Deleted ${r.deleted} events.`);
  };

  const retention = Number(prefs.data_retention_days ?? 90);

  return (
    <>
      <PageHead title="Privacy" subtitle="What is collected, and what never is." />

      <Card title="What gets collected" subtitle="Applies to every paired device">
        {TOGGLES.map((t) => (
          <Switch
            key={t.key}
            label={t.label}
            description={t.desc}
            checked={Boolean(prefs[t.key])}
            onChange={(v) => void toggle(t.key, v)}
          />
        ))}
      </Card>

      <Card title="Never collected">
        <Callout>
          <strong>Enforced on your device, before anything is written or sent.</strong> Banking,
          health and password-manager domains; sign-in and checkout pages; API keys and access
          tokens; credit-card numbers (Luhn-checked); SSNs; JWTs; private-key paths; and OAuth
          tokens in URLs. This list is not editable.
        </Callout>
      </Card>

      <Card title="Your blocklist" subtitle="Extra domains and terms to drop">
        <div className="row-inline">
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
            <option value="domain">Domain</option>
            <option value="query_term">Search term</option>
            <option value="path_prefix">Path prefix</option>
          </select>
          <input
            type="text"
            value={newPattern}
            placeholder={newType === 'domain' ? 'example.com' : newType === 'query_term' ? 'medical' : '/Users/me/private'}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addBlock();
            }}
          />
          <button onClick={() => void addBlock()} disabled={!newPattern.trim()}>Add</button>
        </div>

        <div className="chips">
          {blocks.length === 0 && <span className="note">Nothing added yet.</span>}
          {blocks.map((b) => (
            <span className="chip" key={`${b.pattern_type}:${b.pattern}`}>
              <span className="kind">{b.pattern_type.replace('_', ' ')}</span>
              {b.pattern}
              <button
                title={`Remove ${b.pattern}`}
                aria-label={`Remove ${b.pattern}`}
                onClick={async () => {
                  await api.removeBlock(b.pattern_type, b.pattern);
                  void load();
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <p className="note" style={{ marginTop: 14 }}>
          Synced to your devices for convenience — but the device is the enforcement point. By the
          time data reached this server it would already have left your machine.
        </p>
      </Card>

      <Card title="Retention" subtitle={`Events older than ${retention} days are deleted automatically`}>
        <div className="row-inline" style={{ maxWidth: 280 }}>
          <input
            type="number"
            min={1}
            max={730}
            value={retention}
            onChange={(e) => setPrefs((p) => ({ ...p, data_retention_days: Number(e.target.value) }))}
          />
          <button
            onClick={async () => {
              await api.updatePreferences({ data_retention_days: retention });
              setMsg(`Retention set to ${retention} days.`);
            }}
          >
            Save
          </button>
        </div>
      </Card>

      <Card title="Your data">
        <div className="switch-row">
          <div className="switch-text">
            <strong>Export everything</strong>
            <span>Decrypted in your browser, downloaded as JSON. GDPR Art. 20.</span>
          </div>
          <button onClick={() => void exportData()} disabled={busy}>
            {busy ? <span className="spinner" /> : Icon.download({ size: 14 })} Export
          </button>
        </div>
        <div className="switch-row">
          <div className="switch-text">
            <strong>Delete everything</strong>
            <span>Permanent, and cannot be undone.</span>
          </div>
          <button className="danger" onClick={() => void deleteAll()}>
            {Icon.trash({ size: 14 })} Delete all
          </button>
        </div>
        {msg && <p className="note" style={{ marginTop: 12 }}>{msg}</p>}
      </Card>
    </>
  );
}
