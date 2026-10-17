import { scrypt } from 'scrypt-js';

/**
 * Browser-side counterpart of packages/shared/src/crypto.ts.
 *
 * Node's `crypto.scryptSync` is unavailable here, so this uses scrypt-js with
 * IDENTICAL parameters (N=2^15, r=8, p=1, dkLen=32) — both implement standard
 * scrypt, so the derived keys are byte-identical. AES-GCM comes from WebCrypto.
 *
 * SECURITY NOTE: a browser is a weaker place to hold a decryption key than the
 * desktop app, which keeps it in the OS Keychain. Any XSS on this page can read
 * the key from memory. Mitigations: a strict CSP with no external origins, no
 * third-party scripts, and the key is never written to localStorage or
 * sessionStorage — it lives in memory and dies with the tab.
 */

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Backed by an explicit ArrayBuffer (not ArrayBufferLike) so the result
 * satisfies WebCrypto's BufferSource, which rejects SharedArrayBuffer-backed
 * views.
 */
export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Copy any byte view into a plain ArrayBuffer-backed one. */
function toBufferSource(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(view.byteLength));
  out.set(view);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export type DataKey = { raw: Uint8Array<ArrayBuffer>; cryptoKey: CryptoKey };

/** Derive the AES key. Takes ~1s in a browser — show a spinner. */
export async function deriveKey(passphrase: string, saltB64: string): Promise<DataKey> {
  const raw = await scrypt(
    enc.encode(passphrase.normalize('NFKC')),
    b64ToBytes(saltB64),
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    KEY_LEN,
  );
  const bytes = toBufferSource(new Uint8Array(raw));
  const cryptoKey = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
  return { raw: bytes, cryptoKey };
}

/**
 * Build a DataKey from raw bytes — used when the key came from a PRF-wrapped
 * blob rather than from the passphrase. Identical material either way; only
 * the route differs.
 */
export async function dataKeyFromRaw(raw: Uint8Array): Promise<DataKey> {
  if (raw.length !== KEY_LEN) throw new Error(`Expected a ${KEY_LEN}-byte key, got ${raw.length}.`);
  const bytes = toBufferSource(raw);
  const cryptoKey = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['decrypt']);
  return { raw: bytes, cryptoKey };
}

/** Must match keyFingerprint() in the shared package exactly. */
export async function keyFingerprint(key: DataKey): Promise<string> {
  const prefix = enc.encode('oneconscious:key-fingerprint:v1');
  const buf = new Uint8Array(new ArrayBuffer(prefix.length + key.raw.length));
  buf.set(prefix, 0);
  buf.set(key.raw, prefix.length);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return bytesToB64(new Uint8Array(digest)).slice(0, 22);
}

export interface EncryptedEnvelope {
  eventUuid: string;
  deviceId: string;
  type: string;
  timestamp: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface DecryptedEvent {
  eventUuid: string;
  deviceId: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/**
 * WebCrypto expects the GCM auth tag appended to the ciphertext, whereas Node
 * exposes it separately — so we concatenate before decrypting.
 */
export async function decryptEvent(
  envelope: EncryptedEnvelope,
  key: DataKey,
): Promise<DecryptedEvent> {
  const ct = b64ToBytes(envelope.ciphertext);
  const tag = b64ToBytes(envelope.authTag);
  const combined = new Uint8Array(new ArrayBuffer(ct.length + tag.length));
  combined.set(ct, 0);
  combined.set(tag, ct.length);

  const aad = toBufferSource(
    enc.encode(`${envelope.eventUuid}|${envelope.type}|${envelope.timestamp}|${envelope.deviceId}`),
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(envelope.iv), additionalData: aad, tagLength: 128 },
    key.cryptoKey,
    combined,
  );

  return {
    eventUuid: envelope.eventUuid,
    deviceId: envelope.deviceId,
    type: envelope.type,
    timestamp: envelope.timestamp,
    payload: JSON.parse(dec.decode(plaintext)) as Record<string, unknown>,
  };
}

/** Decrypt a page, counting rather than throwing on individual failures. */
export async function decryptAll(
  envelopes: EncryptedEnvelope[],
  key: DataKey,
): Promise<{ events: DecryptedEvent[]; failed: number }> {
  const events: DecryptedEvent[] = [];
  let failed = 0;
  for (const env of envelopes) {
    try {
      events.push(await decryptEvent(env, key));
    } catch {
      failed++;
    }
  }
  return { events, failed };
}
