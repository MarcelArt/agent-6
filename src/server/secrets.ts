import "@tanstack/react-start/server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { getConfig } from "./config"

/*
 * Authenticated encryption (AES-256-GCM) for secrets stored at rest, such as
 * connection passwords. Stored format: "v1:" + base64(iv | auth tag | ciphertext).
 */

const VERSION = "v1"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function key(encryptionKey?: string): Buffer {
  return Buffer.from(encryptionKey ?? getConfig().encryptionKey, "base64")
}

/** Encrypts `plaintext`. `encryptionKey` defaults to `ENCRYPTION_KEY`. */
export function encrypt(plaintext: string, encryptionKey?: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", key(encryptionKey), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
  return `${VERSION}:${payload.toString("base64")}`
}

/**
 * Decrypts a value made by `encrypt`. Throws when the value was changed or
 * was encrypted with a different key.
 */
export function decrypt(encrypted: string, encryptionKey?: string): string {
  const separator = encrypted.indexOf(":")
  const version = encrypted.slice(0, separator)
  const payload = Buffer.from(encrypted.slice(separator + 1), "base64")
  if (version !== VERSION || payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Cannot decrypt: the value is not an Agent 6 secret.")
  }
  const iv = payload.subarray(0, IV_LENGTH)
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv("aes-256-gcm", key(encryptionKey), iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    throw new Error(
      "Cannot decrypt: the value was changed or ENCRYPTION_KEY is not the key it was encrypted with."
    )
  }
}
