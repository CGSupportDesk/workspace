import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

const databasePath = fileURLToPath(new URL('../../todo (2)/api/database/tasks.db', import.meta.url))
const extractor = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.row_factory = sqlite3.Row
result = {}
for table in ('tasks', 'checklist_items', 'comments', 'activity_logs'):
    result[table] = [dict(row) for row in db.execute('SELECT * FROM ' + table + ' ORDER BY id')]
print(json.dumps(result, ensure_ascii=False))
`
const legacy = JSON.parse(execFileSync('python', ['-c', extractor, databasePath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
const sql = neon(process.env.DATABASE_URL)
const [existing] = await sql`SELECT COUNT(*)::int count FROM todo_tasks`
if (existing.count > 0 && process.env.MIGRATE_TODO_ALLOW_NONEMPTY !== 'true') {
  throw new Error(`Neon already contains ${existing.count} task(s). Set MIGRATE_TODO_ALLOW_NONEMPTY=true only after checking for ID conflicts.`)
}

for (const task of legacy.tasks) {
  let parsedLabels = []
  try { parsedLabels = task.labels ? JSON.parse(task.labels) : [] } catch { parsedLabels = [] }
  await sql.query(`INSERT INTO todo_tasks
    (id,title,assigned_to,status,sort_order,due_date,description,priority,time_estimate,labels,is_recurring,recurrence_pattern,recurrence_parent_id,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
  [task.id, task.title, task.assigned_to, task.status, task.sort_order || 0, task.due_date || null, task.description || null,
    task.priority || 'medium', task.time_estimate || null, JSON.stringify(parsedLabels), Boolean(task.is_recurring), task.recurrence_pattern || null,
    task.recurrence_parent_id || null, task.created_at, task.updated_at])
}

for (const item of legacy.checklist_items) {
  await sql.query(`INSERT INTO todo_checklist_items (id,task_id,text,checked,sort_order,created_at)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
  [item.id, item.task_id, item.text, Boolean(item.checked), item.sort_order || 0, item.created_at])
}

for (const comment of legacy.comments) {
  await sql.query(`INSERT INTO todo_comments (id,task_id,author,body,created_at)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
  [comment.id, comment.task_id, comment.author, comment.body, comment.created_at])
}

for (const entry of legacy.activity_logs) {
  await sql.query(`INSERT INTO todo_activity_logs (id,user_name,action,created_at)
    VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
  [entry.id, entry.user_name, entry.action, entry.created_at])
}

for (const [table, column] of [['todo_tasks', 'id'], ['todo_checklist_items', 'id'], ['todo_comments', 'id'], ['todo_activity_logs', 'id']]) {
  await sql.query(`SELECT setval(pg_get_serial_sequence('${table}','${column}'), COALESCE((SELECT MAX(${column}) FROM ${table}),1), EXISTS(SELECT 1 FROM ${table}))`)
}

console.log({
  migrated: {
    tasks: legacy.tasks.length,
    checklistItems: legacy.checklist_items.length,
    comments: legacy.comments.length,
    activity: legacy.activity_logs.length,
  },
})
