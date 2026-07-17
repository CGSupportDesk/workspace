import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export type SessionPayload = {
  uid: string
  sv: number
  csrf: string
  exp: number
}

const COOKIE_NAME = 'closing_gap_workspace'
const MAX_AGE = 60 * 60 * 24 * 7

function secret() {
  const value = process.env.WORKSPACE_SESSION_SECRET || ''
  if (value.length < 48) throw new Error('WORKSPACE_SESSION_SECRET must be at least 48 characters.')
  return value
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function signature(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function parseCookies(header: string | undefined) {
  const result: Record<string, string> = {}
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return result
}

export function createSession(userId: string, sessionVersion: number) {
  const payload: SessionPayload = {
    uid: userId,
    sv: sessionVersion,
    csrf: randomBytes(24).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  }
  const encoded = encode(JSON.stringify(payload))
  return { payload, token: `${encoded}.${signature(encoded)}` }
}

export function readSession(req: VercelRequest): SessionPayload | null {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null
  const [encoded, provided] = token.split('.')
  if (!encoded || !provided) return null
  const expected = signature(encoded)
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload
    if (!payload.uid || !payload.csrf || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function setSessionCookie(res: VercelResponse, token: string) {
  const secure = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`)
}

export function clearSessionCookie(res: VercelResponse) {
  const secure = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`)
}

