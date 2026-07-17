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
let credentialId = ''
const todoTaskIds = []

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

async function removeTodoTask(id) {
  if (!id) return
  await request('todo.delete', { method: 'POST', json: { id } }).catch(() => undefined)
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
  const credential = await request('vault.credentials.create', { method: 'POST', expected: 201, json: { serviceName: `Smoke credential ${marker}`, websiteUrl: 'https://example.invalid/', loginUsername: `smoke-${marker}`, loginEmail: `smoke-${marker}@example.invalid`, password: 'Credential-Smoke-42', notes: 'Temporary encrypted verification record' } })
  credentialId = credential.payload.credential.id
  const credentialList = await request(`vault.credentials.list&q=${encodeURIComponent(marker)}`)
  const listedCredential = credentialList.payload.credentials.find((item) => item.id === credentialId)
  if (!listedCredential || 'password' in listedCredential) throw new Error('Credential list response was missing or exposed a password.')
  const revealedCredential = await request('vault.credentials.reveal', { method: 'POST', json: { id: credentialId, accountPassword: password } })
  if (revealedCredential.payload.secret.password !== 'Credential-Smoke-42') throw new Error('Encrypted credential did not decrypt correctly.')
  await request('vault.credentials.update', { method: 'POST', json: { id: credentialId, serviceName: `Smoke credential ${marker} updated`, loginUsername: `smoke-${marker}`, loginEmail: `smoke-${marker}@example.invalid`, websiteUrl: 'https://example.invalid/' } })
  await request('vault.credentials.delete', { method: 'POST', json: { id: credentialId } }); credentialId = ''
  console.log('ok encrypted credential create + list redaction + re-auth reveal + update + delete')

  const today = new Date().toISOString().slice(0, 10)
  const todo = await request('todo.create', { method: 'POST', expected: 201, json: {
    title: `Smoke task ${marker}`, assigned_to: identity, status: 'today', due_date: today,
    priority: 'urgent', is_recurring: true, recurrence_pattern: 'daily', labels: ['deployment'],
  } })
  todoTaskIds.push(todo.payload.task.id)
  const todoDetail = await request(`todo.detail&id=${todo.payload.task.id}`)
  if (todoDetail.payload.task.title !== `Smoke task ${marker}`) throw new Error('Created task details did not match.')
  const checklist = await request('todo.checklist.add', { method: 'POST', expected: 201, json: { task_id: todo.payload.task.id, text: 'Verify Neon task persistence' } })
  await request('todo.checklist.toggle', { method: 'POST', json: { id: checklist.payload.id, checked: true } })
  await request('todo.comment.add', { method: 'POST', expected: 201, json: { task_id: todo.payload.task.id, body: 'Automated production verification' } })
  await request('todo.update', { method: 'POST', json: { id: todo.payload.task.id, status: 'completed' } })
  const todoList = await request('todo.list')
  const recurringChild = todoList.payload.tasks.find((task) => task.recurrence_parent_id === todo.payload.task.id)
  if (!recurringChild) throw new Error('Completing a recurring task did not create its next instance.')
  todoTaskIds.push(recurringChild.id)
  await request('todo.activity')
  for (const id of [...todoTaskIds].reverse()) await removeTodoTask(id)
  todoTaskIds.length = 0
  console.log('ok To-Do CRUD + checklist + comments + recurrence + cleanup')

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
    if (credentialId) await request('vault.credentials.delete', { method: 'POST', json: { id: credentialId } }).catch(() => undefined)
    for (const id of [...todoTaskIds].reverse()) await removeTodoTask(id)
    await removeDocument(copyId)
    await removeDocument(documentId)
    if (folderId) await request('vault.folder.delete', { method: 'POST', json: { id: folderId } }).catch(() => undefined)
    if (testUserId) await request('users.delete', { method: 'POST', json: { id: testUserId } }).catch(() => undefined)
  }
}
