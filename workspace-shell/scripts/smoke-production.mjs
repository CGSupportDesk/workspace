import { readFile } from 'node:fs/promises'

const baseUrl = (process.env.WORKSPACE_SMOKE_URL || '').replace(/\/$/, '')
const identity = process.env.WORKSPACE_ADMIN_USERNAME || ''
const password = process.env.WORKSPACE_ADMIN_PASSWORD || ''

if (!baseUrl || !identity || !password) {
  throw new Error('Set WORKSPACE_SMOKE_URL, WORKSPACE_ADMIN_USERNAME, and WORKSPACE_ADMIN_PASSWORD.')
}

let cookie = ''
let csrf = ''
let folderId = ''
let documentId = ''
let copyId = ''
let testUserId = ''

async function request(action, { method = 'GET', json, form, expected = 200 } = {}) {
  const headers = { Accept: 'application/json' }
  if (cookie) headers.Cookie = cookie
  if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf
  let body
  if (json) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }
  const response = await fetch(`${baseUrl}/api/index.php?action=${action}`, { method, headers, body, redirect: 'manual' })
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (response.status !== expected) {
    throw new Error(`${action}: expected ${expected}, received ${response.status}: ${typeof payload === 'string' ? payload.slice(0, 180) : JSON.stringify(payload)}`)
  }
  return { response, payload, text }
}

async function removeDocument(id) {
  if (!id) return
  await request('vault.document.delete', { method: 'POST', json: { id } }).catch(() => undefined)
}

try {
  const login = await request('auth.login', { method: 'POST', json: { identity, password } })
  const setCookie = login.response.headers.get('set-cookie') || ''
  cookie = setCookie.split(';', 1)[0]
  csrf = login.payload.csrfToken
  if (!cookie || !csrf || login.payload.user.role !== 'admin') throw new Error('Login did not establish an administrator session.')
  console.log('ok auth.login')

  const status = await request('auth.status')
  if (status.payload.user.username !== identity) throw new Error('Session identity does not match.')
  console.log('ok auth.status')

  const marker = Date.now().toString(36)
  const folder = await request('vault.folder.create', { method: 'POST', expected: 201, json: { name: `Smoke ${marker}`, visibility: 'private' } })
  folderId = folder.payload.folder.id
  console.log('ok vault.folder.create')

  const form = new FormData()
  form.set('file', new Blob([await readFile(new URL('../README.md', import.meta.url))], { type: 'text/markdown' }), `workspace-smoke-${marker}.md`)
  form.set('folderId', folderId)
  form.set('category', 'Deployment test')
  form.set('visibility', 'private')
  const uploaded = await request('vault.document.upload', { method: 'POST', expected: 201, form })
  documentId = uploaded.payload.document.id
  console.log('ok vault.document.upload')

  const listing = await request('vault.list')
  if (!listing.payload.documents.some((document) => document.id === documentId)) throw new Error('Uploaded document was not returned by vault.list.')
  console.log('ok vault.list')

  const preview = await request(`vault.document.preview&id=${encodeURIComponent(documentId)}`)
  if (!preview.text.includes('Workspace')) throw new Error(`Private Blob preview returned unexpected content (${preview.text.length} bytes): ${JSON.stringify(preview.text.slice(0, 100))}`)
  console.log('ok vault.document.preview')

  const copied = await request('vault.document.copy', { method: 'POST', expected: 201, json: { id: documentId } })
  copyId = copied.payload.document.id
  console.log('ok vault.document.copy')

  const versionForm = new FormData()
  versionForm.set('file', new Blob(['Workspace production smoke test version 2\n'], { type: 'text/markdown' }), `workspace-smoke-${marker}-v2.md`)
  versionForm.set('id', documentId)
  const version = await request('vault.document.version', { method: 'POST', expected: 201, form: versionForm })
  if (version.payload.version !== 2) throw new Error('Document version was not incremented.')
  const versions = await request(`vault.versions&id=${encodeURIComponent(documentId)}`)
  if (versions.payload.versions.length !== 2) throw new Error('Version history did not return two versions.')
  console.log('ok vault.document.version + vault.versions')

  const search = await request(`search&q=${encodeURIComponent(marker)}`)
  if (!search.payload.documents.some((document) => document.id === documentId)) throw new Error('Uploaded document was not searchable.')
  console.log('ok search')

  const username = `smoke-${marker}`
  await request('users.create', { method: 'POST', expected: 201, json: { username, email: `${username}@example.invalid`, password: 'Smoke-Test-42-A', role: 'member', active: true } })
  const users = await request('users.list')
  testUserId = users.payload.users.find((user) => user.username === username)?.id || ''
  if (!testUserId) throw new Error('Created user was not returned by users.list.')
  await request('users.delete', { method: 'POST', json: { id: testUserId } })
  testUserId = ''
  console.log('ok users.create + users.list + users.delete')

  await removeDocument(copyId); copyId = ''
  await removeDocument(documentId); documentId = ''
  await request('vault.folder.delete', { method: 'POST', json: { id: folderId } }); folderId = ''
  console.log('ok Vault cleanup')

  await request('auth.logout', { method: 'POST', json: {} })
  await request('auth.status', { expected: 401 })
  console.log('ok auth.logout + session invalidation')
  console.log('Production smoke test passed.')
} finally {
  if (cookie && csrf) {
    await removeDocument(copyId)
    await removeDocument(documentId)
    if (folderId) await request('vault.folder.delete', { method: 'POST', json: { id: folderId } }).catch(() => undefined)
    if (testUserId) await request('users.delete', { method: 'POST', json: { id: testUserId } }).catch(() => undefined)
  }
}
