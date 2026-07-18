import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/lib/env";

/**
 * Cifrado autenticado (AES-256-GCM) para secretos que deben recuperarse en
 * claro (p. ej. el secreto de firma de un webhook por endpoint). NO usar para
 * cosas que puedan hashearse (como API keys) — esas se guardan hasheadas.
 *
 * Formato: base64(iv).base64(tag).base64(ciphertext)
 */
function key(): Buffer {
  const raw = env.secretEncKey();
  if (!raw) throw new Error("KYB_SECRET_ENC_KEY no configurado");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("KYB_SECRET_ENC_KEY debe ser 32 bytes codificados en base64");
  }
  return buf;
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(".");
}

export function open(sealed: string): string {
  const [ivB64, tagB64, ctB64] = sealed.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Ciphertext inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
