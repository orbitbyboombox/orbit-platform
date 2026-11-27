import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function encryptionKey() {
  const configured = process.env.ORBIT_BACKUP_ENCRYPTION_KEY?.trim();
  if (configured) {
    const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.byteLength === 32) return key;
  }
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (passphrase) return scryptSync(passphrase, "orbit-admin-backup-v1", 32);
  throw new Error("BACKUP_ENCRYPTION_NOT_CONFIGURED");
}

export function encryptBackupArtifact(bytes: Uint8Array, key = encryptionKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from("ORBITBK1"), iv, cipher.getAuthTag(), ciphertext]));
}

export function decryptBackupArtifact(bytes: Uint8Array, key = encryptionKey()) {
  const envelope = Buffer.from(bytes);
  if (envelope.subarray(0, 8).toString() !== "ORBITBK1") throw new Error("BACKUP_ENVELOPE_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(8, 20));
  decipher.setAuthTag(envelope.subarray(20, 36));
  return new Uint8Array(Buffer.concat([decipher.update(envelope.subarray(36)), decipher.final()]));
}
