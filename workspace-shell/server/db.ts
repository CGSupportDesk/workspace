import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { hash } from 'bcryptjs'

type Row = Record<string, unknown>

let client: NeonQueryFunction<false, false> | null = null
let migration: Promise<void> | null = null

export function sqlClient() {
  if (client) return client
  const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!connection) throw new Error('DATABASE_URL is not configured.')
  client = neon(connection)
  return client
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return await sqlClient().query(text, params) as T[]
}

export async function ensureDatabase() {
  if (migration) return migration
  migration = migrate()
  return migration
}

async function migrate() {
  const sql = sqlClient()
  await sql`CREATE TABLE IF NOT EXISTS workspace_users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS workspace_users_username_lower ON workspace_users (LOWER(username))`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS workspace_users_email_lower ON workspace_users (LOWER(email))`
  await sql`CREATE TABLE IF NOT EXISTS vault_folders (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id UUID NULL REFERENCES vault_folders(id) ON DELETE RESTRICT,
    owner_id UUID NOT NULL REFERENCES workspace_users(id) ON DELETE RESTRICT,
    visibility TEXT NOT NULL CHECK (visibility IN ('private', 'workspace', 'restricted')),
    favourite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS vault_documents (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    folder_id UUID NULL REFERENCES vault_folders(id) ON DELETE RESTRICT,
    category TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES workspace_users(id) ON DELETE RESTRICT,
    visibility TEXT NOT NULL CHECK (visibility IN ('private', 'workspace', 'restricted')),
    favourite BOOLEAN NOT NULL DEFAULT FALSE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS vault_document_versions (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    created_by UUID NULL REFERENCES workspace_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, version)
  )`
  await sql`CREATE TABLE IF NOT EXISTS vault_credentials (
    id UUID PRIMARY KEY,
    service_name TEXT NOT NULL,
    website_url TEXT NULL,
    encrypted_username TEXT NOT NULL,
    encrypted_email TEXT NOT NULL,
    encrypted_password TEXT NOT NULL,
    encrypted_notes TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES workspace_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS vault_assets (
    id UUID PRIMARY KEY,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('sim', 'phone', 'laptop', 'tablet', 'accessory', 'software', 'other')),
    name TEXT NOT NULL,
    identifier TEXT NOT NULL UNIQUE,
    registered_owner TEXT NOT NULL DEFAULT '',
    current_owner TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'spare', 'inactive', 'repair', 'lost', 'retired')),
    monthly_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_cost >= 0),
    renewal_day SMALLINT NULL CHECK (renewal_day IS NULL OR renewal_day BETWEEN 1 AND 31),
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by UUID NULL REFERENCES workspace_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS workspace_activity (
    id UUID PRIMARY KEY,
    actor_id UUID NULL REFERENCES workspace_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NULL,
    entity_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS workspace_login_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip TEXT NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS todo_tasks (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    assigned_to TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','today','in_progress','completed')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    due_date DATE NULL,
    description TEXT NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
    time_estimate TEXT NULL,
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_pattern TEXT NULL CHECK (recurrence_pattern IS NULL OR recurrence_pattern IN ('daily','weekly','monthly')),
    recurrence_parent_id BIGINT NULL REFERENCES todo_tasks(id) ON DELETE SET NULL,
    created_by UUID NULL REFERENCES workspace_users(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES workspace_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS todo_checklist_items (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS todo_comments (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    user_id UUID NULL REFERENCES workspace_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS todo_activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NULL REFERENCES workspace_users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE INDEX IF NOT EXISTS vault_documents_owner_idx ON vault_documents(owner_id)`
  await sql`CREATE INDEX IF NOT EXISTS vault_documents_folder_idx ON vault_documents(folder_id)`
  await sql`CREATE INDEX IF NOT EXISTS vault_documents_updated_idx ON vault_documents(updated_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS vault_folders_owner_idx ON vault_folders(owner_id)`
  await sql`CREATE INDEX IF NOT EXISTS vault_credentials_updated_idx ON vault_credentials(updated_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS vault_assets_updated_idx ON vault_assets(updated_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS vault_assets_status_idx ON vault_assets(status, asset_type)`
  await sql`CREATE INDEX IF NOT EXISTS workspace_activity_created_idx ON workspace_activity(created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS todo_tasks_status_order_idx ON todo_tasks(status,sort_order)`
  await sql`CREATE INDEX IF NOT EXISTS todo_tasks_due_idx ON todo_tasks(due_date)`
  await sql`CREATE INDEX IF NOT EXISTS todo_activity_created_idx ON todo_activity_logs(created_at DESC)`

  const admins = await query<{ count: string }>("SELECT COUNT(*)::text count FROM workspace_users WHERE role = 'admin'")
  if (Number(admins[0]?.count || 0) === 0) {
    const username = process.env.WORKSPACE_ADMIN_USERNAME?.trim() || ''
    const email = process.env.WORKSPACE_ADMIN_EMAIL?.trim().toLowerCase() || ''
    const password = process.env.WORKSPACE_ADMIN_PASSWORD || ''
    if (!username || !email.includes('@') || !strongPassword(password)) {
      throw new Error('Workspace admin bootstrap variables are missing or invalid.')
    }
    await query(
      `INSERT INTO workspace_users (id, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin') ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), username, email, await hash(password, 12)],
    )
  }

  const owner = (await query<{ id: string }>("SELECT id FROM workspace_users WHERE role='admin' ORDER BY created_at LIMIT 1"))[0]
  if (owner) {
    const seedAssets = [
      ['Adithya SIM', '+917824839704', '', 'Adithya', '', 'active', '', ''],
      ['Sruthi SIM', '+917909135193', '', 'Sruthi', '', 'active', '', ''],
      ['Naveen SIM', '+919497572855', '', 'Naveen', '', 'active', '', ''],
      ['Sachin SIM', '+919074294791', '', 'Sachin', '', 'active', '', ''],
      ['Unassigned Jio SIM', '+919778495649', '', '', 'Jio', 'inactive', '', 'Not used now.'],
      ['Kristom New Airtel', '+919633294791', '', 'Kristom', 'Airtel', 'active', '', 'New Airtel SIM.'],
      ['Kristom Old Airtel', '+919567991836', '', 'Kristom', 'Airtel', 'active', '', 'Old Airtel SIM.'],
    ] as const
    const records = seedAssets.map(([name, identifier, registeredOwner, currentOwner, provider, status, location, notes]) => ({ id:crypto.randomUUID(),asset_type:'sim',name,identifier,registered_owner:registeredOwner,current_owner:currentOwner,provider,status,location,notes,created_by:owner.id }))
    await query(
      `INSERT INTO vault_assets (id, asset_type, name, identifier, registered_owner, current_owner, provider, status, location, notes, created_by)
       SELECT id, asset_type, name, identifier, registered_owner, current_owner, provider, status, location, notes, created_by
       FROM jsonb_to_recordset($1::jsonb) AS seed(id UUID,asset_type TEXT,name TEXT,identifier TEXT,registered_owner TEXT,current_owner TEXT,provider TEXT,status TEXT,location TEXT,notes TEXT,created_by UUID)
       ON CONFLICT (identifier) DO NOTHING`,
      [JSON.stringify(records)],
    )
  }
}

export function strongPassword(password: string) {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
}

export async function logActivity(userId: string, action: string, entityType: string, entityId: string | null, entityName: string) {
  await query(
    `INSERT INTO workspace_activity (id, actor_id, action, entity_type, entity_id, entity_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), userId, action, entityType, entityId, entityName],
  )
}
