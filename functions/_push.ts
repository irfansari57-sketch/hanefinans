/**
 * Web Push delivery helper — Cloudflare Workers runtime uyumlu.
 *
 * `web-push` npm paketi Node crypto bağımlı, Workers'da çalışmaz. Bu modül
 * Web Crypto API ile RFC 8030 (Web Push) + RFC 8291 (Message Encryption) +
 * RFC 8292 (VAPID) implementasyonu sağlar.
 *
 * Akış:
 *   1) VAPID JWT'sini ES256 (P-256 ECDSA) ile imzala — Authorization header'a koy
 *   2) Payload'ı aes128gcm ile şifrele (ECDH(P-256) + HKDF + AES-128-GCM)
 *   3) Subscription endpoint'e POST — push servisi (FCM/Mozilla/Apple) ileri sürer
 *
 * Subscription objesi (browser'dan gelen):
 *   {
 *     endpoint: "https://fcm.googleapis.com/fcm/send/...",
 *     keys: { p256dh: "BA...", auth: "ABC..." }
 *   }
 *
 * VAPID env (Cloudflare Pages Settings):
 *   VAPID_PUBLIC_KEY  — base64url, "BL..."
 *   VAPID_PRIVATE_KEY — base64url, ~43 char
 *   VAPID_SUBJECT     — "mailto:..." veya site URL
 */

// ============================================================
// Base64URL helpers
// ============================================================

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ============================================================
// VAPID JWT (RFC 8292) — ES256 signed
// ============================================================

/**
 * VAPID private key'den (raw base64url d component) bir Web Crypto CryptoKey üret.
 *
 * web-push'un ürettiği private key formatı: 32 byte raw "d" değeri.
 * Web Crypto'ya import etmek için JWK formatına çevirip pkcs8 yerine jwk olarak
 * importKey çağırıyoruz.
 *
 * Public key (uncompressed point, 65 byte: 0x04 || x(32) || y(32)) JWK'nin
 * x ve y bileşenlerini sağlar — VAPID private key'den public key'i türetemediğimiz
 * için public key de parametre olarak istiyoruz (env'den geliyor zaten).
 */
async function importVapidPrivateKey(privateKeyB64: string, publicKeyB64: string): Promise<CryptoKey> {
  const d = base64urlDecode(privateKeyB64);
  const pub = base64urlDecode(publicKeyB64); // 0x04 || x(32) || y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(`VAPID public key uncompressed P-256 olmalı (65 byte 0x04 prefix), aldık: ${pub.length} byte`);
  }
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: base64urlEncode(d),
    x: base64urlEncode(x),
    y: base64urlEncode(y),
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * VAPID JWT üret + imzala.
 *
 * @param audience  Push servisinin origin'i, ör: "https://fcm.googleapis.com"
 * @param subject   "mailto:admin@example.com" veya site URL
 * @param privateKey  importVapidPrivateKey'den dönen CryptoKey
 * @param expirySec  exp claim (unix saniye). Max 24 saat, biz 12 saat veriyoruz.
 */
async function signVapidJwt(
  audience: string,
  subject: string,
  privateKey: CryptoKey,
  expirySec: number,
): Promise<string> {
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: expirySec,
    sub: subject,
  })));
  const unsigned = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64urlEncode(sig)}`;
}

// ============================================================
// Payload encryption (RFC 8291 — aes128gcm)
// ============================================================
//
// Akış:
//   1) Lokal ephemeral P-256 anahtar çifti üret (her push için yeni)
//   2) Subscription'ın p256dh public key'i ile ECDH yap → shared secret (32 byte)
//   3) HKDF: PRK = HMAC-SHA256(auth_secret, shared_secret)
//   4) HKDF: IKM = HMAC-SHA256(PRK, "WebPush: info\0" || ua_public || as_public || 0x01)
//   5) Salt (16 byte random)
//   6) HKDF(IKM, salt) → CEK (16 byte AES-128 key) + NONCE (12 byte)
//   7) Padding: payload || 0x02 (RFC 8188 record terminator)
//   8) AES-128-GCM encrypt → ciphertext + tag (16 byte)
//   9) Output: salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen) || encrypted
//      - rs = 4096 (record size)
//      - idlen = 65 (uncompressed public key length)
//      - keyid = ephemeral public key (uncompressed)

async function importSubscriberPublicKey(p256dhB64: string): Promise<CryptoKey> {
  const raw = base64urlDecode(p256dhB64); // 0x04 || x(32) || y(32)
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

async function generateEphemeralKey(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  ) as Promise<CryptoKeyPair>;
}

async function exportRawPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
  return new Uint8Array(bits);
}

async function hmacSha256(key: Uint8Array | ArrayBuffer, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, data);
  return new Uint8Array(sig);
}

/**
 * RFC 5869 HKDF — Extract + Expand. SHA-256.
 *
 * @param salt   IKM extract için salt
 * @param ikm    input key material
 * @param info   expand'da kullanılan context
 * @param length output uzunluğu (byte)
 */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // Extract
  const prk = await hmacSha256(salt, ikm);
  // Expand — N = ceil(length / 32)
  const N = Math.ceil(length / 32);
  let T = new Uint8Array(0);
  const out = new Uint8Array(N * 32);
  let prev = new Uint8Array(0);
  for (let i = 1; i <= N; i++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev, 0);
    input.set(info, prev.length);
    input[prev.length + info.length] = i;
    prev = await hmacSha256(prk, input);
    out.set(prev, (i - 1) * 32);
  }
  return out.slice(0, length);
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

interface EncryptedPayload {
  body: Uint8Array;
  /** Headers eklenmesi gereken: ECDH'nin public key'i base64url. */
  serverPublicKey: string;
}

async function encryptPayload(
  payload: Uint8Array,
  p256dhB64: string,
  authSecretB64: string,
): Promise<EncryptedPayload> {
  const subscriberPub = await importSubscriberPublicKey(p256dhB64);
  const ephemeral = await generateEphemeralKey();
  const ephemeralPubRaw = await exportRawPublicKey(ephemeral.publicKey);

  const sharedSecret = await deriveSharedSecret(ephemeral.privateKey, subscriberPub);
  const authSecret = base64urlDecode(authSecretB64);

  // 1) Auth-secret PRK
  // info = "WebPush: info\0" || ua_public || as_public
  const subscriberPubRaw = base64urlDecode(p256dhB64);
  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\0'),
    subscriberPubRaw,
    ephemeralPubRaw,
  );
  // IKM = HKDF(authSecret, sharedSecret, info, 32)
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  // 2) Salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 3) CEK
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  // 4) NONCE
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // 5) Padded payload — record terminator 0x02
  const padded = concat(payload, new Uint8Array([0x02]));

  // 6) AES-128-GCM encrypt
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    cekKey,
    padded,
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  // 7) Header: salt(16) + rs(4, big-endian uint32) + idlen(1) + keyid
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([ephemeralPubRaw.length]); // 65
  const header = concat(salt, rs, idlen, ephemeralPubRaw);

  return {
    body: concat(header, ciphertext),
    serverPublicKey: base64urlEncode(ephemeralPubRaw),
  };
}

// ============================================================
// Public API
// ============================================================

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushOptions {
  /** TTL saniye — push servisi bu süre tutar, alıcı offline ise dropr. Default 86400 (24s). */
  ttl?: number;
  /** Urgency: very-low | low | normal | high. Default normal. */
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** Topic — aynı topic'ten yeni gelirse eskisini değiştirir (max 32 char). */
  topic?: string;
}

export interface PushVapidEnv {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** Subscription artık geçersizse (404/410) silinmeli. */
  expired: boolean;
  error?: string;
}

/**
 * Tek bir subscription'a push gönder. Payload string olarak gelir, içeri UTF-8'e
 * dönüştürülüp şifrelenir. Push servisinin response status'una göre PushResult döner.
 *
 * 201 → başarılı (alıcıya yollandı, alıcı offline'sa TTL dolana kadar bekler)
 * 404/410 → subscription expired/unsubscribed; DB'den silinmeli
 * 413 → payload çok büyük (max ~3KB aes128gcm sonrası)
 * 429 → rate limit; backoff lazım
 * diğer → hata
 */
export async function sendPush(
  subscription: PushSubscriptionData,
  payload: string,
  env: PushVapidEnv,
  options: PushOptions = {},
): Promise<PushResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return { ok: false, status: 0, expired: false, error: 'VAPID env tam değil' };
  }

  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  // VAPID JWT — exp max 24h, biz 12h kullanıyoruz
  const privateKey = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const expirySec = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const jwt = await signVapidJwt(audience, env.VAPID_SUBJECT, privateKey, expirySec);

  // Payload encryption
  const payloadBytes = new TextEncoder().encode(payload);
  const encrypted = await encryptPayload(payloadBytes, subscription.p256dh, subscription.auth);

  // Headers
  const headers: Record<string, string> = {
    'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    'TTL': String(options.ttl ?? 86400),
    'Urgency': options.urgency ?? 'normal',
  };
  if (options.topic) headers['Topic'] = options.topic.slice(0, 32);

  try {
    const resp = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: encrypted.body,
    });

    const expired = resp.status === 404 || resp.status === 410;
    const ok = resp.status >= 200 && resp.status < 300;
    let error: string | undefined;
    if (!ok) {
      try {
        error = (await resp.text()).slice(0, 200);
      } catch {
        error = `HTTP ${resp.status}`;
      }
    }
    return { ok, status: resp.status, expired, error };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      expired: false,
      error: `Network: ${(e as Error).message}`,
    };
  }
}

/**
 * Çok kullanıcılı toplu gönderim — paralel fetch, sonuçları dön.
 * 410/404 expired'leri çağıran taraf DB'den silmeli.
 */
export async function sendPushMany(
  subscriptions: PushSubscriptionData[],
  payload: string,
  env: PushVapidEnv,
  options: PushOptions = {},
): Promise<Array<PushResult & { endpoint: string }>> {
  return Promise.all(
    subscriptions.map(async (sub) => {
      const r = await sendPush(sub, payload, env, options);
      return { ...r, endpoint: sub.endpoint };
    }),
  );
}
