import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const algorithm = 'aes-256-gcm'

function key() {
  const encoded = process.env.WORKSPACE_VAULT_ENCRYPTION_KEY || ''
  const value = Buffer.from(encoded, 'base64')
  if (value.length !== 32) throw new Error('WORKSPACE_VAULT_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  return value
}

export function encryptCredential(value: string, context: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, key(), iv, { authTagLength: 16 })
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptCredential(payload: string, context: string) {
  const [version, encodedIv, encodedTag, encodedValue] = payload.split('.')
  if (version !== 'v1' || !encodedIv || !encodedTag || encodedValue === undefined) throw new Error('Credential ciphertext is invalid.')
  const decipher = createDecipheriv(algorithm, key(), Buffer.from(encodedIv, 'base64url'), { authTagLength: 16 })
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encodedValue, 'base64url')), decipher.final()]).toString('utf8')
}
