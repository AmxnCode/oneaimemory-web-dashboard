/**
 * Passkey sign-in and PRF-based key unwrap.
 *
 * Two things happen in ONE biometric prompt:
 *   1. the authenticator signs the server's challenge  → proves identity
 *   2. the PRF extension returns a per-credential secret → unwraps the data key
 *
 * The PRF output never leaves this device. The server stores only the wrapped
 * key, which it cannot open — so adding biometrics does not weaken the
 * end-to-end property.
 *
 * The WebAuthn calls are hand-rolled rather than delegated to a wrapper,
 * because PRF results are ArrayBuffers that do not survive a library's JSON
 * serialization, and splitting them into a second assertion would mean
 * prompting the user twice.
 */

const enc = new TextEncoder();

/**
 * Fixed application salt. PRF output is HMAC(credential-scoped key, salt), so
 * a shared salt still yields a distinct secret per credential — and a constant
 * lets sign-in evaluate PRF before the server has told us which credential was
 * used, keeping it to a single prompt.
 */
const PRF_SALT_LABEL = 'oneconscious:prf:v1';

async function prfSalt(): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(PRF_SALT_LABEL));
  return new Uint8Array(digest);
}

export const PRF_SALT_ID = PRF_SALT_LABEL;

// --- base64url ---------------------------------------------------------------

function toB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// --- capability -------------------------------------------------------------

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// --- KEK derivation ----------------------------------------------------------

/**
 * Turn the raw PRF output into an AES-GCM key.
 *
 * HKDF rather than using the bytes directly, for domain separation: the same
 * PRF secret could later be used for another purpose, and a labelled
 * derivation keeps those uses independent.
 */
async function kekFromPrf(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(new ArrayBuffer(0)),
      info: enc.encode('oneconscious:data-key-wrap:v1'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface WrappedKey {
  wrappedKey: string; // base64
  wrappedKeyIv: string; // base64
}

export async function wrapDataKey(rawDataKey: Uint8Array, prfOutput: ArrayBuffer): Promise<WrappedKey> {
  const kek = await kekFromPrf(prfOutput);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  // Copy onto a plain ArrayBuffer so it satisfies BufferSource.
  const plain = new Uint8Array(new ArrayBuffer(rawDataKey.byteLength));
  plain.set(rawDataKey);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, plain);
  return { wrappedKey: bytesToB64(new Uint8Array(sealed)), wrappedKeyIv: bytesToB64(iv) };
}

export async function unwrapDataKey(
  wrapped: string,
  iv: string,
  prfOutput: ArrayBuffer,
): Promise<Uint8Array<ArrayBuffer>> {
  const kek = await kekFromPrf(prfOutput);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(iv) },
    kek,
    b64ToBytes(wrapped),
  );
  const out = new Uint8Array(new ArrayBuffer(raw.byteLength));
  out.set(new Uint8Array(raw));
  return out;
}

// --- serialization -----------------------------------------------------------

function serializeAssertion(cred: PublicKeyCredential) {
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: {},
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      authenticatorData: toB64url(r.authenticatorData),
      signature: toB64url(r.signature),
      userHandle: r.userHandle ? toB64url(r.userHandle) : undefined,
    },
  };
}

function serializeAttestation(cred: PublicKeyCredential) {
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: {},
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      attestationObject: toB64url(r.attestationObject),
      transports: r.getTransports?.() ?? [],
    },
  };
}

// --- registration ------------------------------------------------------------

export interface RegistrationResult {
  response: ReturnType<typeof serializeAttestation>;
  /** Present only when the authenticator supports PRF. */
  prfOutput: ArrayBuffer | null;
}

/**
 * Create a credential, then — if PRF is supported — obtain the secret with a
 * follow-up assertion.
 *
 * The second prompt is unavoidable at enrolment: most authenticators report
 * only `prf.enabled` during creation and will not evaluate until an assertion.
 * Sign-in afterwards is a single prompt.
 */
export async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResult> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: fromB64url(options.challenge),
    rp: options.rp,
    user: {
      id: fromB64url(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    attestation: options.attestation as AttestationConveyancePreference | undefined,
    excludeCredentials: options.excludeCredentials?.map((c) => ({
      id: fromB64url(c.id),
      type: 'public-key' as const,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    authenticatorSelection: options.authenticatorSelection,
    extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
  };

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey creation was cancelled.');

  const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean } };
  const prfEnabled = Boolean(ext.prf?.enabled);

  let prfOutput: ArrayBuffer | null = null;
  if (prfEnabled) {
    prfOutput = await evaluatePrf(cred.rawId);
  }

  return { response: serializeAttestation(cred), prfOutput };
}

/** Assertion used only to read the PRF secret; never sent to the server. */
async function evaluatePrf(rawId: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))),
        allowCredentials: [{ id: rawId, type: 'public-key' }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: await prfSalt() } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return null;
    const ext = cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
    return ext.prf?.results?.first ?? null;
  } catch {
    return null;
  }
}

// --- authentication ----------------------------------------------------------

export interface AssertionResult {
  response: ReturnType<typeof serializeAssertion>;
  prfOutput: ArrayBuffer | null;
}

/**
 * One prompt: signs the server's challenge and evaluates PRF simultaneously.
 * `allowCredentials` is empty so the browser offers discoverable credentials —
 * the user never types an email.
 */
export async function assertPasskey(challengeB64url: string): Promise<AssertionResult> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: fromB64url(challengeB64url),
      userVerification: 'required',
      extensions: { prf: { eval: { first: await prfSalt() } } } as AuthenticationExtensionsClientInputs,
    },
    mediation: 'optional',
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error('Sign-in was cancelled.');

  const ext = cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  return { response: serializeAssertion(cred), prfOutput: ext.prf?.results?.first ?? null };
}

// --- minimal option types (what the server sends) ---------------------------

export interface PublicKeyCredentialCreationOptionsJSON {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  attestation?: string;
  excludeCredentials?: Array<{ id: string; transports?: string[] }>;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
}
