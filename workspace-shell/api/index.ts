import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { compare, hash } from 'bcryptjs'
import formidable, { type File as FormidableFile } from 'formidable'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { copyPrivateBlob, deletePrivateBlobs, getPrivateBlob, uploadPrivateBlob } from '../server/blob.js'
import { ensureDatabase, logActivity, query, strongPassword } from '../server/db.js'
import { clearSessionCookie, createSession, readSession, setSessionCookie, type SessionPayload } from '../server/security.js'
import { handleTodo } from '../server/todo.js'
import { decryptCredential, encryptCredential } from '../server/credential-crypto.js'

type Role = 'admin' | 'member'
type Visibility = 'private' | 'workspace' | 'restricted'
type UserRow = {
  id: string
  username: string
  email: string
  password_hash: string
  role: Role
  active: boolean
  session_version: number
  created_at: string | Date
  updated_at: string | Date
}
type DocumentRow = {
  id: string
  name: string
  file_type: string
  file_size: string | number
  storage_path: string
  folder_id: string | null
  category: string
  owner_id: string
  owner_name?: string
  visibility: Visibility
  favourite: boolean
  version: number
  created_at: string | Date
  updated_at: string | Date
}
type FolderRow = {
  id: string
  name: string
  parent_id: string | null
  owner_id: string
  owner_name?: string
  visibility: Visibility
  favourite: boolean
  created_at: string | Date
  updated_at: string | Date
}
type CredentialRow = {
  id: string
  service_name: string
  website_url: string | null
  encrypted_username: string
  encrypted_email: string
  encrypted_password: string
  encrypted_notes: string
  owner_id: string
  owner_name?: string
  created_at: string | Date
  updated_at: string | Date
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function fail(status: number, message: string): never { throw new HttpError(status, message) }
function iso(value: string | Date) { return new Date(value).toISOString() }
function actionOf(req: VercelRequest) { return Array.isArray(req.query.action) ? req.query.action[0] : String(req.query.action || '') }
function param(req: VercelRequest, name: string) { const value = req.query[name]; return Array.isArray(value) ? String(value[0] || '') : String(value || '') }
function json(res: VercelResponse, status: number, payload: unknown) { return res.status(status).json(payload) }
function publicUser(row: UserRow) { return { id: row.id, username: row.username, email: row.email, role: row.role, active: Boolean(row.active), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) } }
function publicDocument(row: DocumentRow) { return { id: row.id, name: row.name, fileType: row.file_type, fileSize: Number(row.file_size), folderId: row.folder_id, category: row.category, ownerId: row.owner_id, ownerName: row.owner_name || '', visibility: row.visibility, favourite: Boolean(row.favourite), version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) } }
function publicFolder(row: FolderRow) { return { id: row.id, name: row.name, parentId: row.parent_id, ownerId: row.owner_id, ownerName: row.owner_name || '', visibility: row.visibility, favourite: Boolean(row.favourite), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) } }
function credentialText(value: unknown, max: number) { return [...String(value ?? '')].map(character => { const code=character.charCodeAt(0);return code<32||code===127?' ':character }).join('').trim().slice(0,max) }
function publicCredential(row: CredentialRow) { return { id:row.id,serviceName:row.service_name,websiteUrl:row.website_url||'',loginUsername:decryptCredential(row.encrypted_username,`${row.id}:username`),loginEmail:decryptCredential(row.encrypted_email,`${row.id}:email`),hasPassword:true,hasNotes:Boolean(decryptCredential(row.encrypted_notes,`${row.id}:notes`)),ownerId:row.owner_id,ownerName:row.owner_name||'',createdAt:iso(row.created_at),updatedAt:iso(row.updated_at) } }
function credentialUrl(value: unknown) { const raw=credentialText(value,500);if(!raw)return null;try{const parsed=new URL(raw);if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')fail(422,'Website URL must use HTTP or HTTPS.');return parsed.toString()}catch(error){if(error instanceof HttpError)throw error;fail(422,'Enter a valid website URL.')} }

function cleanName(value: string, max = 140) {
  return value.replace(/[\x00-\x1f\x7f]/g, '').replace(/\\/g, '/').split('/').pop()!.replace(/[^\p{L}\p{N} ._()[\]-]+/gu, '-').replace(/^[ .-]+|[ .-]+$/g, '').slice(0, max)
}
function visibility(value: unknown): Visibility {
  if (value === 'private' || value === 'workspace' || value === 'restricted') return value
  return fail(422, 'Invalid visibility setting.')
}
function canAccess(record: { owner_id: string; visibility: Visibility }, user: UserRow) { return user.role === 'admin' || record.visibility === 'workspace' || record.owner_id === user.id }
function canManage(record: { owner_id: string }, user: UserRow) { return user.role === 'admin' || record.owner_id === user.id }

async function body(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body as Record<string, unknown>
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) as Record<string, unknown> } catch { fail(400, 'Invalid JSON request body.') }
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> } catch { return fail(400, 'Invalid JSON request body.') }
}

async function currentUser(req: VercelRequest, required = true): Promise<{ user: UserRow; session: SessionPayload } | null> {
  const session = readSession(req)
  if (!session) { if (required) fail(401, 'Authentication required.'); return null }
  const rows = await query<UserRow>('SELECT * FROM workspace_users WHERE id = $1 AND active = TRUE', [session.uid])
  const user = rows[0]
  if (!user || Number(user.session_version) !== Number(session.sv)) { if (required) fail(401, 'Your session is no longer valid.'); return null }
  return { user, session }
}

async function adminUser(req: VercelRequest) {
  const auth = await currentUser(req)
  if (!auth || auth.user.role !== 'admin') fail(403, 'Administrator access required.')
  return auth
}

function mutation(req: VercelRequest, session: SessionPayload) {
  if (req.method !== 'POST') fail(405, 'Method not allowed.')
  const csrf = Array.isArray(req.headers['x-csrf-token']) ? req.headers['x-csrf-token'][0] : req.headers['x-csrf-token']
  if (!csrf || csrf !== session.csrf) fail(419, 'Your secure form token expired. Refresh and try again.')
}

async function documentById(id: string, user: UserRow, manage = false) {
  const document = (await query<DocumentRow>('SELECT * FROM vault_documents WHERE id = $1', [id]))[0]
  if (!document) fail(404, 'Document not found.')
  if (!(manage ? canManage(document, user) : canAccess(document, user))) fail(403, 'You do not have access to this document.')
  return document
}

async function folderById(id: string, user: UserRow, manage = false) {
  const folder = (await query<FolderRow>('SELECT * FROM vault_folders WHERE id = $1', [id]))[0]
  if (!folder) fail(404, 'Folder not found.')
  if (!(manage ? canManage(folder, user) : canAccess(folder, user))) fail(403, 'You do not have access to this folder.')
  return folder
}

const allowedTypes: Record<string, string[]> = {
  pdf: ['application/pdf'], doc: ['application/msword', 'application/octet-stream'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  xls: ['application/vnd.ms-excel', 'application/octet-stream'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
  ppt: ['application/vnd.ms-powerpoint', 'application/octet-stream'], pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/octet-stream'],
  txt: ['text/plain', 'application/octet-stream'], md: ['text/markdown', 'text/plain', 'application/octet-stream'], csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'], zip: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
}

async function parseUpload(req: VercelRequest) {
  const maxMb = Math.max(1, Number(process.env.WORKSPACE_MAX_UPLOAD_MB || 20))
  const form = formidable({ maxFiles: 1, maxFileSize: maxMb * 1024 * 1024, uploadDir: '/tmp', keepExtensions: true })
  const [fields, files] = await form.parse(req)
  const candidate = Array.isArray(files.file) ? files.file[0] : files.file
  if (!candidate) fail(422, 'Choose a valid file to upload.')
  const file = candidate as FormidableFile
  const name = cleanName(file.originalFilename || '')
  const extension = extname(name).slice(1).toLowerCase()
  if (!name || !allowedTypes[extension]) { await unlink(file.filepath).catch(() => undefined); fail(415, 'This file type is not allowed.') }
  const mime = file.mimetype || 'application/octet-stream'
  if (!allowedTypes[extension].includes(mime)) { await unlink(file.filepath).catch(() => undefined); fail(415, 'The detected file type is not allowed.') }
  const field = (key: string) => { const value = fields[key]; return Array.isArray(value) ? String(value[0] || '') : String(value || '') }
  return { file, name, extension, mime, field }
}

function clientIp(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for']
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 80)
}

async function handle(req: VercelRequest, res: VercelResponse) {
  await ensureDatabase()
  const action = actionOf(req)

  if (action === 'health') return json(res, 200, { ok: true, database: 'neon', storage: 'private-blob' })

  if (action === 'auth.status') {
    const auth = await currentUser(req, false)
    if (!auth) fail(401, 'Authentication required.')
    return json(res, 200, { user: publicUser(auth.user), csrfToken: auth.session.csrf })
  }

  if (action === 'auth.login') {
    if (req.method !== 'POST') fail(405, 'Method not allowed.')
    const input = await body(req)
    const identity = String(input.identity || '').trim().toLowerCase()
    const password = String(input.password || '')
    if (!identity || !password) fail(422, 'Enter your username or email and password.')
    const ip = clientIp(req)
    const attempts = await query<{ count: string }>("SELECT COUNT(*)::text count FROM workspace_login_attempts WHERE ip=$1 AND success=FALSE AND attempted_at > NOW() - INTERVAL '15 minutes'", [ip])
    if (Number(attempts[0]?.count || 0) >= 5) fail(429, 'Too many failed attempts. Try again in 15 minutes.')
    const user = (await query<UserRow>('SELECT * FROM workspace_users WHERE LOWER(username)=$1 OR LOWER(email)=$1 LIMIT 1', [identity]))[0]
    if (!user || !user.active || !(await compare(password, user.password_hash))) {
      await query('INSERT INTO workspace_login_attempts (ip, success) VALUES ($1, FALSE)', [ip])
      fail(401, 'The username/email or password is incorrect.')
    }
    await query('INSERT INTO workspace_login_attempts (ip, success) VALUES ($1, TRUE)', [ip])
    await query("DELETE FROM workspace_login_attempts WHERE attempted_at < NOW() - INTERVAL '1 day'")
    const created = createSession(user.id, Number(user.session_version))
    setSessionCookie(res, created.token)
    return json(res, 200, { user: publicUser(user), csrfToken: created.payload.csrf })
  }

  if (action === 'auth.logout') {
    const auth = await currentUser(req)
    mutation(req, auth!.session)
    await query('UPDATE workspace_users SET session_version=session_version+1,updated_at=NOW() WHERE id=$1', [auth!.user.id])
    clearSessionCookie(res)
    return json(res, 200, { success: true })
  }

  if (action === 'users.list') {
    await adminUser(req)
    const users = await query<UserRow>('SELECT * FROM workspace_users ORDER BY active DESC, LOWER(username)')
    return json(res, 200, { users: users.map(publicUser) })
  }

  if (action.startsWith('todo.')) {
    const auth = await currentUser(req)
    return handleTodo(action, req, res, auth!, fail)
  }

  if (action === 'users.create') {
    const auth = await adminUser(req); mutation(req, auth.session); const input = await body(req)
    const username = cleanName(String(input.username || ''), 40); const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '')
    const role: Role = input.role === 'admin' ? 'admin' : 'member'; const active = input.active !== false
    if (username.length < 2) fail(422, 'Username must be at least 2 characters.')
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(422, 'Enter a valid email address.')
    if (!strongPassword(password)) fail(422, 'Password must be at least 10 characters and include upper, lower and a number.')
    const id = randomUUID()
    try { await query('INSERT INTO workspace_users (id,username,email,password_hash,role,active) VALUES ($1,$2,$3,$4,$5,$6)', [id,username,email,await hash(password,12),role,active]) }
    catch (error) { if (String(error).includes('unique')) fail(409, 'That username or email is already in use.'); throw error }
    await logActivity(auth.user.id, 'created user', 'user', id, username)
    return json(res, 201, { success: true })
  }

  if (action === 'users.update') {
    const auth = await adminUser(req); mutation(req, auth.session); const input = await body(req); const id = String(input.id || '')
    const target = (await query<UserRow>('SELECT * FROM workspace_users WHERE id=$1', [id]))[0]; if (!target) fail(404, 'User not found.')
    const username = cleanName(String(input.username || ''),40); const email=String(input.email||'').trim().toLowerCase(); const role:Role=input.role==='admin'?'admin':'member'; const active=input.active===true
    if(username.length<2||!/^\S+@\S+\.\S+$/.test(email))fail(422,'Enter a valid username and email.')
    if(id===auth.user.id&&(!active||role!=='admin'))fail(422,'You cannot remove your own active administrator access.')
    try{await query('UPDATE workspace_users SET username=$1,email=$2,role=$3,active=$4,updated_at=NOW() WHERE id=$5',[username,email,role,active,id])}catch(error){if(String(error).includes('unique'))fail(409,'That username or email is already in use.');throw error}
    await logActivity(auth.user.id,'updated user','user',id,username); return json(res,200,{success:true})
  }

  if (action === 'users.reset-password') {
    const auth=await adminUser(req);mutation(req,auth.session);const input=await body(req);const id=String(input.id||'');const password=String(input.password||'')
    if(!strongPassword(password))fail(422,'Password must be at least 10 characters and include upper, lower and a number.')
    const rows=await query<{id:string}>('UPDATE workspace_users SET password_hash=$1,session_version=session_version+1,updated_at=NOW() WHERE id=$2 RETURNING id',[await hash(password,12),id]);if(!rows.length)fail(404,'User not found.')
    await logActivity(auth.user.id,'reset password for','user',id,'a workspace user');return json(res,200,{success:true})
  }

  if (action === 'users.delete') {
    const auth=await adminUser(req);mutation(req,auth.session);const id=String((await body(req)).id||'');if(id===auth.user.id)fail(422,'You cannot delete your own account.')
    const target=(await query<UserRow>('SELECT * FROM workspace_users WHERE id=$1',[id]))[0];if(!target)fail(404,'User not found.')
    await query('UPDATE vault_documents SET owner_id=$1 WHERE owner_id=$2',[auth.user.id,id]);await query('UPDATE vault_folders SET owner_id=$1 WHERE owner_id=$2',[auth.user.id,id]);await query('DELETE FROM workspace_users WHERE id=$1',[id]);await logActivity(auth.user.id,'deleted user','user',null,target.username);return json(res,200,{success:true})
  }

  if (action === 'profile.update') {
    const auth=await currentUser(req);mutation(req,auth!.session);const input=await body(req);const username=cleanName(String(input.username||''),40);const email=String(input.email||'').trim().toLowerCase();if(username.length<2||!/^\S+@\S+\.\S+$/.test(email))fail(422,'Enter a valid username and email.')
    try{await query('UPDATE workspace_users SET username=$1,email=$2,updated_at=NOW() WHERE id=$3',[username,email,auth!.user.id])}catch(error){if(String(error).includes('unique'))fail(409,'That username or email is already in use.');throw error}await logActivity(auth!.user.id,'updated profile','user',auth!.user.id,username);return json(res,200,{success:true})
  }

  if (action === 'profile.password') {
    const auth=await currentUser(req);mutation(req,auth!.session);const input=await body(req);const current=String(input.current||'');const password=String(input.password||'');if(!(await compare(current,auth!.user.password_hash)))fail(401,'Your current password is incorrect.');if(!strongPassword(password))fail(422,'Password must be at least 10 characters and include upper, lower and a number.')
    const version=Number(auth!.user.session_version)+1;await query('UPDATE workspace_users SET password_hash=$1,session_version=$2,updated_at=NOW() WHERE id=$3',[await hash(password,12),version,auth!.user.id]);const created=createSession(auth!.user.id,version);setSessionCookie(res,created.token);return json(res,200,{success:true,csrfToken:created.payload.csrf})
  }

  if(action==='vault.credentials.list'){
    await adminUser(req);const q=param(req,'q').trim().toLowerCase();const rows=await query<CredentialRow>("SELECT c.*,u.username owner_name FROM vault_credentials c JOIN workspace_users u ON u.id=c.owner_id ORDER BY c.updated_at DESC");const credentials=rows.map(publicCredential).filter(item=>!q||[item.serviceName,item.websiteUrl,item.loginUsername,item.loginEmail].some(value=>value.toLowerCase().includes(q)));return json(res,200,{credentials})
  }
  if(action==='vault.credentials.create'){
    const auth=await adminUser(req);mutation(req,auth.session);const input=await body(req);const id=randomUUID();const serviceName=credentialText(input.serviceName,100);const websiteUrl=credentialUrl(input.websiteUrl);const loginUsername=credentialText(input.loginUsername,320);const loginEmail=credentialText(input.loginEmail,320);const password=String(input.password||'');const notes=credentialText(input.notes,5000);if(!serviceName)fail(422,'Service name is required.');if(!loginUsername&&!loginEmail)fail(422,'Add a username or email.');if(!password||password.length>2000)fail(422,'A password is required and must be under 2,000 characters.');await query('INSERT INTO vault_credentials (id,service_name,website_url,encrypted_username,encrypted_email,encrypted_password,encrypted_notes,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,serviceName,websiteUrl,encryptCredential(loginUsername,`${id}:username`),encryptCredential(loginEmail,`${id}:email`),encryptCredential(password,`${id}:password`),encryptCredential(notes,`${id}:notes`),auth.user.id]);await logActivity(auth.user.id,'created credential','credential',id,serviceName);return json(res,201,{credential:{id}})
  }
  if(action==='vault.credentials.update'){
    const auth=await adminUser(req);mutation(req,auth.session);const input=await body(req);const id=String(input.id||'');const record=(await query<CredentialRow>('SELECT * FROM vault_credentials WHERE id=$1',[id]))[0];if(!record)fail(404,'Credential not found.');const serviceName='serviceName'in input?credentialText(input.serviceName,100):record.service_name;const websiteUrl='websiteUrl'in input?credentialUrl(input.websiteUrl):record.website_url;const loginUsername='loginUsername'in input?credentialText(input.loginUsername,320):decryptCredential(record.encrypted_username,`${id}:username`);const loginEmail='loginEmail'in input?credentialText(input.loginEmail,320):decryptCredential(record.encrypted_email,`${id}:email`);const password=input.password?String(input.password):null;const notes='notes'in input?credentialText(input.notes,5000):null;if(!serviceName)fail(422,'Service name is required.');if(!loginUsername&&!loginEmail)fail(422,'Add a username or email.');if(password&&password.length>2000)fail(422,'Password must be under 2,000 characters.');await query('UPDATE vault_credentials SET service_name=$1,website_url=$2,encrypted_username=$3,encrypted_email=$4,encrypted_password=$5,encrypted_notes=$6,updated_at=NOW() WHERE id=$7',[serviceName,websiteUrl,encryptCredential(loginUsername,`${id}:username`),encryptCredential(loginEmail,`${id}:email`),password?encryptCredential(password,`${id}:password`):record.encrypted_password,notes!==null?encryptCredential(notes,`${id}:notes`):record.encrypted_notes,id]);await logActivity(auth.user.id,'updated credential','credential',id,serviceName);return json(res,200,{success:true})
  }
  if(action==='vault.credentials.reveal'){
    const auth=await adminUser(req);mutation(req,auth.session);const input=await body(req);if(!(await compare(String(input.accountPassword||''),auth.user.password_hash)))fail(401,'Workspace password is incorrect.');const id=String(input.id||'');const record=(await query<CredentialRow>('SELECT * FROM vault_credentials WHERE id=$1',[id]))[0];if(!record)fail(404,'Credential not found.');await logActivity(auth.user.id,'revealed credential','credential',id,record.service_name);return json(res,200,{secret:{password:decryptCredential(record.encrypted_password,`${id}:password`),notes:decryptCredential(record.encrypted_notes,`${id}:notes`)}})
  }
  if(action==='vault.credentials.delete'){
    const auth=await adminUser(req);mutation(req,auth.session);const id=String((await body(req)).id||'');const rows=await query<{service_name:string}>('DELETE FROM vault_credentials WHERE id=$1 RETURNING service_name',[id]);if(!rows.length)fail(404,'Credential not found.');await logActivity(auth.user.id,'deleted credential','credential',null,rows[0].service_name);return json(res,200,{success:true})
  }

  if (action === 'vault.list') {
    const auth=await currentUser(req);const section=param(req,'section')||'documents';const q=param(req,'q').trim();const category=param(req,'category').trim();const owner=param(req,'owner').trim();const modified=param(req,'modified')
    const docWhere=["(d.visibility='workspace' OR d.owner_id=$1 OR $2=TRUE)"];const folderWhere=["(f.visibility='workspace' OR f.owner_id=$1 OR $2=TRUE)"];const docValues:unknown[]=[auth!.user.id,auth!.user.role==='admin'];const folderValues:unknown[]=[...docValues]
    const addDoc=(condition:string,value:unknown)=>{docValues.push(value);docWhere.push(condition.replace('?',`$${docValues.length}`))};const addFolder=(condition:string,value:unknown)=>{folderValues.push(value);folderWhere.push(condition.replace('?',`$${folderValues.length}`))}
    if(q){addDoc('d.name ILIKE ?',`%${q}%`);addFolder('f.name ILIKE ?',`%${q}%`)}if(category)addDoc('d.category=?',category);if(owner){addDoc('d.owner_id=?',owner);addFolder('f.owner_id=?',owner)}
    if(modified==='today'){docWhere.push("d.updated_at>=NOW()-INTERVAL '1 day'");folderWhere.push("f.updated_at>=NOW()-INTERVAL '1 day'")}else if(modified==='week'){docWhere.push("d.updated_at>=NOW()-INTERVAL '7 days'");folderWhere.push("f.updated_at>=NOW()-INTERVAL '7 days'")}else if(modified==='month'){docWhere.push("d.updated_at>=NOW()-INTERVAL '1 month'");folderWhere.push("f.updated_at>=NOW()-INTERVAL '1 month'")}
    if(section==='favourites'){docWhere.push('d.favourite=TRUE');folderWhere.push('f.favourite=TRUE')}else if(section==='recent'){docWhere.push("d.updated_at>=NOW()-INTERVAL '30 days'");folderWhere.push("f.updated_at>=NOW()-INTERVAL '30 days'")}else if(section==='shared'){docWhere.push("d.visibility='workspace'");folderWhere.push("f.visibility='workspace'")}
    const documents=await query<DocumentRow>(`SELECT d.*,u.username owner_name FROM vault_documents d JOIN workspace_users u ON u.id=d.owner_id WHERE ${docWhere.join(' AND ')} ORDER BY d.updated_at DESC`,docValues)
    const folders=await query<FolderRow>(`SELECT f.*,u.username owner_name FROM vault_folders f JOIN workspace_users u ON u.id=f.owner_id WHERE ${folderWhere.join(' AND ')} ORDER BY f.updated_at DESC`,folderValues)
    const owners=await query<{id:string;username:string}>('SELECT id,username FROM workspace_users WHERE active=TRUE ORDER BY LOWER(username)')
    return json(res,200,{documents:documents.map(publicDocument),folders:folders.map(publicFolder),owners})
  }

  if(action==='vault.folder.create'){
    const auth=await currentUser(req);mutation(req,auth!.session);const input=await body(req);const name=cleanName(String(input.name||''),80);const access=visibility(input.visibility||'workspace');const parentId=input.parentId?String(input.parentId):null;if(!name)fail(422,'Folder name is required.');if(parentId)await folderById(parentId,auth!.user);const id=randomUUID();await query('INSERT INTO vault_folders (id,name,parent_id,owner_id,visibility) VALUES ($1,$2,$3,$4,$5)',[id,name,parentId,auth!.user.id,access]);await logActivity(auth!.user.id,'created folder','folder',id,name);return json(res,201,{folder:{id}})
  }
  if(action==='vault.folder.rename'){
    const auth=await currentUser(req);mutation(req,auth!.session);const input=await body(req);const folder=await folderById(String(input.id||''),auth!.user,true);const name=cleanName(String(input.name||''),80);if(!name)fail(422,'Folder name is required.');await query('UPDATE vault_folders SET name=$1,updated_at=NOW() WHERE id=$2',[name,folder.id]);await logActivity(auth!.user.id,'renamed folder','folder',folder.id,name);return json(res,200,{success:true})
  }
  if(action==='vault.folder.delete'){
    const auth=await currentUser(req);mutation(req,auth!.session);const id=String((await body(req)).id||'');const folder=await folderById(id,auth!.user,true);const count=await query<{count:string}>('SELECT ((SELECT COUNT(*) FROM vault_documents WHERE folder_id=$1)+(SELECT COUNT(*) FROM vault_folders WHERE parent_id=$1))::text count',[id]);if(Number(count[0]?.count||0)>0)fail(409,'Move or delete the folder contents first.');await query('DELETE FROM vault_folders WHERE id=$1',[id]);await logActivity(auth!.user.id,'deleted folder','folder',null,folder.name);return json(res,200,{success:true})
  }

  if(action==='vault.document.upload'){
    const auth=await currentUser(req);mutation(req,auth!.session);const upload=await parseUpload(req);try{const folderId=upload.field('folderId')||null;if(folderId)await folderById(folderId,auth!.user);const category=cleanName(upload.field('category')||'Operational',40)||'Operational';const access=visibility(upload.field('visibility')||'workspace');const id=randomUUID();const pathname=`vault/${auth!.user.id}/${id}-${upload.name}`;const blob=await uploadPrivateBlob(pathname,upload.file.filepath,upload.mime,upload.file.size>4*1024*1024);await query('INSERT INTO vault_documents (id,name,file_type,file_size,storage_path,folder_id,category,owner_id,visibility) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,upload.name,upload.mime,upload.file.size,blob.url,folderId,category,auth!.user.id,access]);await query('INSERT INTO vault_document_versions (id,document_id,version,storage_path,file_size,created_by) VALUES ($1,$2,1,$3,$4,$5)',[randomUUID(),id,blob.url,upload.file.size,auth!.user.id]);await logActivity(auth!.user.id,'uploaded document','document',id,upload.name);return json(res,201,{document:{id}})}finally{await unlink(upload.file.filepath).catch(()=>undefined)}
  }

  if(action==='vault.document.version'){
    const auth=await currentUser(req);mutation(req,auth!.session);const upload=await parseUpload(req);try{const document=await documentById(upload.field('id'),auth!.user,true);const versionNumber=Number(document.version)+1;const pathname=`vault/${auth!.user.id}/${document.id}-v${versionNumber}-${upload.name}`;const blob=await uploadPrivateBlob(pathname,upload.file.filepath,upload.mime,upload.file.size>4*1024*1024);await query('UPDATE vault_documents SET file_type=$1,file_size=$2,storage_path=$3,version=$4,updated_at=NOW() WHERE id=$5',[upload.mime,upload.file.size,blob.url,versionNumber,document.id]);await query('INSERT INTO vault_document_versions (id,document_id,version,storage_path,file_size,created_by) VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),document.id,versionNumber,blob.url,upload.file.size,auth!.user.id]);await logActivity(auth!.user.id,'uploaded document version','document',document.id,`${document.name} v${versionNumber}`);return json(res,201,{version:versionNumber})}finally{await unlink(upload.file.filepath).catch(()=>undefined)}
  }

  if(action==='vault.document.update'){
    const auth=await currentUser(req);mutation(req,auth!.session);const input=await body(req);const document=await documentById(String(input.id||''),auth!.user,true);const updates:string[]=[];const values:unknown[]=[];const add=(column:string,value:unknown)=>{values.push(value);updates.push(`${column}=$${values.length}`)}
    if('favourite'in input)add('favourite',Boolean(input.favourite));if('name'in input){const name=cleanName(String(input.name||''));if(!name)fail(422,'Document name is required.');add('name',name)}if('category'in input)add('category',cleanName(String(input.category||''),40));if('visibility'in input)add('visibility',visibility(input.visibility));if('folderId'in input){const folderId=input.folderId?String(input.folderId):null;if(folderId)await folderById(folderId,auth!.user);add('folder_id',folderId)}if(!updates.length)fail(422,'No changes were provided.');values.push(document.id);await query(`UPDATE vault_documents SET ${updates.join(',')},updated_at=NOW() WHERE id=$${values.length}`,values);await logActivity(auth!.user.id,'updated document','document',document.id,document.name);return json(res,200,{success:true})
  }

  if(action==='vault.document.copy'){
    const auth=await currentUser(req);mutation(req,auth!.session);const source=await documentById(String((await body(req)).id||''),auth!.user);const id=randomUUID();const name=cleanName(`Copy of ${source.name}`);const pathname=`vault/${auth!.user.id}/${id}-${name}`;const blob=await copyPrivateBlob(source.storage_path,pathname,source.file_type);await query('INSERT INTO vault_documents (id,name,file_type,file_size,storage_path,folder_id,category,owner_id,visibility,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)',[id,name,source.file_type,source.file_size,blob.url,source.folder_id,source.category,auth!.user.id,source.visibility]);await query('INSERT INTO vault_document_versions (id,document_id,version,storage_path,file_size,created_by) VALUES ($1,$2,1,$3,$4,$5)',[randomUUID(),id,blob.url,source.file_size,auth!.user.id]);await logActivity(auth!.user.id,'copied document','document',id,name);return json(res,201,{document:{id}})
  }

  if(action==='vault.document.delete'){
    const auth=await currentUser(req);mutation(req,auth!.session);const id=String((await body(req)).id||'');const document=await documentById(id,auth!.user,true);const paths=await query<{storage_path:string}>('SELECT storage_path FROM vault_document_versions WHERE document_id=$1 UNION SELECT storage_path FROM vault_documents WHERE id=$1',[id]);await query('DELETE FROM vault_documents WHERE id=$1',[id]);await deletePrivateBlobs([...new Set(paths.map(item=>item.storage_path))]);await logActivity(auth!.user.id,'deleted document','document',null,document.name);return json(res,200,{success:true})
  }

  if(action==='vault.document.download'||action==='vault.document.preview'){
    const auth=await currentUser(req);const document=await documentById(param(req,'id'),auth!.user);const result=await getPrivateBlob(document.storage_path);if(!result||result.statusCode!==200)fail(404,'The stored file is missing.');const previewable=document.file_type==='application/pdf'||document.file_type.startsWith('image/')||document.file_type.startsWith('text/');const disposition=action==='vault.document.preview'&&previewable?'inline':'attachment';const safeName=document.name.replace(/["\r\n]/g,'_');res.status(200);res.setHeader('Content-Type',document.file_type);res.setHeader('Content-Length',String(document.file_size));res.setHeader('Content-Disposition',`${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(document.name)}`);res.setHeader('Cache-Control','private, no-store');await pipeline(Readable.fromWeb(result.stream as never),res);return
  }

  if(action==='vault.versions'){
    const auth=await currentUser(req);const document=await documentById(param(req,'id'),auth!.user);const rows=await query<{id:string;document_id:string;version:number;file_size:string|number;created_by_name:string;created_at:string|Date}>("SELECT v.*,COALESCE(u.username,'Deleted user') created_by_name FROM vault_document_versions v LEFT JOIN workspace_users u ON u.id=v.created_by WHERE v.document_id=$1 ORDER BY v.version DESC",[document.id]);return json(res,200,{versions:rows.map(row=>({id:row.id,documentId:row.document_id,version:Number(row.version),fileSize:Number(row.file_size),createdByName:row.created_by_name,createdAt:iso(row.created_at)}))})
  }

  if(action==='vault.activity'){
    await currentUser(req);const rows=await query<{id:string;actor_name:string;action:string;entity_type:string;entity_name:string;created_at:string|Date}>("SELECT a.*,COALESCE(u.username,'Deleted user') actor_name FROM workspace_activity a LEFT JOIN workspace_users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100");return json(res,200,{activity:rows.map(row=>({id:row.id,actorName:row.actor_name,action:row.action,entityType:row.entity_type,entityName:row.entity_name,createdAt:iso(row.created_at)}))})
  }

  if(action==='search'){
    const auth=await currentUser(req);const q=param(req,'q').trim();if(!q)return json(res,200,{documents:[],folders:[],users:[]});const needle=`%${q}%`;const admin=auth!.user.role==='admin';const documents=await query<DocumentRow>("SELECT d.*,u.username owner_name FROM vault_documents d JOIN workspace_users u ON u.id=d.owner_id WHERE d.name ILIKE $1 AND (d.visibility='workspace' OR d.owner_id=$2 OR $3=TRUE) ORDER BY d.updated_at DESC LIMIT 8",[needle,auth!.user.id,admin]);const folders=await query<FolderRow>("SELECT f.*,u.username owner_name FROM vault_folders f JOIN workspace_users u ON u.id=f.owner_id WHERE f.name ILIKE $1 AND (f.visibility='workspace' OR f.owner_id=$2 OR $3=TRUE) ORDER BY f.updated_at DESC LIMIT 6",[needle,auth!.user.id,admin]);const users=admin?await query<UserRow>('SELECT * FROM workspace_users WHERE username ILIKE $1 OR email ILIKE $1 ORDER BY LOWER(username) LIMIT 6',[needle]):[];return json(res,200,{documents:documents.map(publicDocument),folders:folders.map(publicFolder),users:users.map(publicUser)})
  }

  fail(404,'Unknown API action.')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()')
  try { await handle(req,res) }
  catch(error){if(res.headersSent)return;const status=error instanceof HttpError?error.status:500;const message=error instanceof HttpError?error.message:(process.env.WORKSPACE_DEBUG==='true'&&error instanceof Error?error.message:'An unexpected server error occurred.');if(!(error instanceof HttpError))console.error(error);json(res,status,{error:message})}
}
