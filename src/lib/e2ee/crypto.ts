"use client";

export const E2EE_VERSION = 1;
export const KDF_ITERATIONS = 310_000;
const VERIFIER_PLAINTEXT = "lumen-e2ee-verifier-v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKek(password: string, salt: Uint8Array, iterations: number) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type EncryptionBundle = {
  kdfSalt: string;
  kdfIterations: number;
  wrappedDek: string;
  wrappedDekIv: string;
  recoveryWrappedDek: string;
  recoveryWrappedDekIv: string;
  verifierCiphertext: string;
  verifierIv: string;
  keyVersion: number;
};

export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // URL-safe base64 without padding for easier copying.
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function recoveryKeyToBytes(key: string): Uint8Array {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4);
  return fromBase64(padded);
}

async function deriveRecoveryKek(recoveryKey: string, salt: Uint8Array) {
  // Use recovery key bytes as high-entropy input material via PBKDF2 with fixed iterations.
  const material = recoveryKeyToBytes(recoveryKey);
  const keyMaterial = await crypto.subtle.importKey("raw", buf(material), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createEncryptionSetup(password: string): Promise<{
  bundle: EncryptionBundle;
  dek: CryptoKey;
  recoveryKey: string;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(password, salt, KDF_ITERATIONS);
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const rawDek = new Uint8Array(await crypto.subtle.exportKey("raw", dek));

  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedDek = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, kek, rawDek));

  const recoveryKey = generateRecoveryKey();

  const verifierIv = crypto.getRandomValues(new Uint8Array(12));
  const verifierCiphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: verifierIv }, dek, new TextEncoder().encode(VERIFIER_PLAINTEXT)),
  );

  // Derive recovery KEK from (recoveryKey, kdfSalt) so only the user salt needs to be stored.
  const recoveryKek = await deriveRecoveryKek(recoveryKey, salt);
  const recoveryWrapIv = crypto.getRandomValues(new Uint8Array(12));
  const recoveryWrappedDek = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: recoveryWrapIv }, recoveryKek, rawDek),
  );

  return {
    dek,
    recoveryKey,
    bundle: {
      kdfSalt: toBase64(salt),
      kdfIterations: KDF_ITERATIONS,
      wrappedDek: toBase64(wrappedDek),
      wrappedDekIv: toBase64(wrapIv),
      recoveryWrappedDek: toBase64(recoveryWrappedDek),
      recoveryWrappedDekIv: toBase64(recoveryWrapIv),
      verifierCiphertext: toBase64(verifierCiphertext),
      verifierIv: toBase64(verifierIv),
      keyVersion: 1,
    },
  };
}

export async function unlockWithPassword(password: string, bundle: EncryptionBundle): Promise<CryptoKey> {
  const salt = fromBase64(bundle.kdfSalt);
  const kek = await deriveKek(password, salt, bundle.kdfIterations);
  const rawDek = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf(fromBase64(bundle.wrappedDekIv)) },
      kek,
      buf(fromBase64(bundle.wrappedDek)),
    ),
  );
  const dek = await crypto.subtle.importKey("raw", rawDek, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf(fromBase64(bundle.verifierIv)) },
    dek,
    buf(fromBase64(bundle.verifierCiphertext)),
  );
  return dek;
}

export async function unlockWithRecoveryKey(recoveryKey: string, bundle: EncryptionBundle): Promise<CryptoKey> {
  const salt = fromBase64(bundle.kdfSalt);
  const kek = await deriveRecoveryKek(recoveryKey, salt);
  const rawDek = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf(fromBase64(bundle.recoveryWrappedDekIv)) },
      kek,
      buf(fromBase64(bundle.recoveryWrappedDek)),
    ),
  );
  const dek = await crypto.subtle.importKey("raw", rawDek, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf(fromBase64(bundle.verifierIv)) },
    dek,
    buf(fromBase64(bundle.verifierCiphertext)),
  );
  return dek;
}

export async function encryptString(plaintext: string, dek: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, new TextEncoder().encode(plaintext)),
  );
  return { ciphertext: toBase64(ct), iv: toBase64(iv) };
}

export async function decryptString(ciphertext: string, iv: string, dek: CryptoKey): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf(fromBase64(iv)) },
    dek,
    buf(fromBase64(ciphertext)),
  );
  return new TextDecoder().decode(pt);
}
