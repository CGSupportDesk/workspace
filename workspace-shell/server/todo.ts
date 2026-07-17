import type { VercelRequest, VercelResponse } from '@vercel/node'
import { query } from './db.js'

type Fail = (status: number, message: string) => never
type TodoAuth = { user: { id: string; username: string }; session: { csrf: string } }
type TaskRow = Record<string, unknown> & {
  id: string | number
  title: string
  assigned_to: string
  status: string
  sort_order: number
  due_date: string | null
  description: string | null
  priority: string
  time_estimate: string | null
  labels: unknown
  is_recurring: boolean
  recurrence_pattern: string | null
  recurrence_parent_id: string | number | null
  created_at: string
  updated_at: string
  checklist_total?: string | number
  checklist_done?: string | number
}

const statuses = new Set(['backlog', 'today', 'in_progress', 'completed'])
const priorities = new Set(['urgent', 'high', 'medium', 'low'])
const recurrencePatterns = new Set(['daily', 'weekly', 'monthly'])
const taskColumns = `t.id,t.title,t.assigned_to,t.status,t.sort_order,
  TO_CHAR(t.due_date,'YYYY-MM-DD') due_date,t.description,t.priority,t.time_estimate,t.labels,
  t.is_recurring,t.recurrence_pattern,t.recurrence_parent_id,
  TO_CHAR(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') created_at,
  TO_CHAR(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') updated_at`

function clean(value: unknown, max: number) {
  return [...String(value ?? '')].map((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('').replace(/\s+/g, ' ').trim().slice(0, max)
}

function taskId(value: unknown, fail: Fail) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) fail(422, 'A valid task is required.')
  return id
}

function optionalDate(value: unknown, fail: Fail) {
  if (value === null || value === undefined || value === '') return null
  const date = String(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) fail(422, 'Enter a valid due date.')
  return date
}

function labels(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => clean(item, 30)).filter(Boolean))].slice(0, 12)
}

function publicTask(row: TaskRow) {
  return {
    ...row,
    id: Number(row.id),
    sort_order: Number(row.sort_order),
    labels: Array.isArray(row.labels) ? row.labels : [],
    is_recurring: row.is_recurring ? 1 : 0,
    recurrence_parent_id: row.recurrence_parent_id == null ? null : Number(row.recurrence_parent_id),
    checklist_summary: { total: Number(row.checklist_total || 0), done: Number(row.checklist_done || 0) },
  }
}

async function requestBody(req: VercelRequest, fail: Fail) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body as Record<string, unknown>
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) as Record<string, unknown> } catch { fail(400, 'Invalid JSON request body.') }
  }
  return {}
}

function mutation(req: VercelRequest, auth: TodoAuth, fail: Fail) {
  if (req.method !== 'POST') fail(405, 'Method not allowed.')
  const csrf = Array.isArray(req.headers['x-csrf-token']) ? req.headers['x-csrf-token'][0] : req.headers['x-csrf-token']
  if (!csrf || csrf !== auth.session.csrf) fail(419, 'Your secure form token expired. Refresh and try again.')
}

async function taskById(id: number, fail: Fail) {
  const rows = await query<TaskRow>(`SELECT ${taskColumns},
    (SELECT COUNT(*) FROM todo_checklist_items c WHERE c.task_id=t.id)::text checklist_total,
    (SELECT COUNT(*) FROM todo_checklist_items c WHERE c.task_id=t.id AND c.checked=TRUE)::text checklist_done
    FROM todo_tasks t WHERE t.id=$1`, [id])
  if (!rows[0]) fail(404, 'Task not found.')
  return rows[0]
}

async function activity(auth: TodoAuth, action: string) {
  await query('INSERT INTO todo_activity_logs (user_id,user_name,action) VALUES ($1,$2,$3)', [auth.user.id, auth.user.username, action])
}

function nextRecurringDate(baseDate: string | null, pattern: string) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const date = new Date(`${baseDate || today.toISOString().slice(0, 10)}T00:00:00Z`)
  do {
    if (pattern === 'daily') date.setUTCDate(date.getUTCDate() + 1)
    else if (pattern === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
    else date.setUTCMonth(date.getUTCMonth() + 1)
  } while (date <= today)
  return date.toISOString().slice(0, 10)
}

export async function handleTodo(action: string, req: VercelRequest, res: VercelResponse, auth: TodoAuth, fail: Fail) {
  if (action === 'todo.list') {
    const rows = await query<TaskRow>(`SELECT ${taskColumns},
      (SELECT COUNT(*) FROM todo_checklist_items c WHERE c.task_id=t.id)::text checklist_total,
      (SELECT COUNT(*) FROM todo_checklist_items c WHERE c.task_id=t.id AND c.checked=TRUE)::text checklist_done
      FROM todo_tasks t ORDER BY t.sort_order,t.created_at`)
    return res.status(200).json({ success: true, tasks: rows.map(publicTask) })
  }

  if (action === 'todo.detail') {
    const id = taskId(req.query.id, fail)
    const task = publicTask(await taskById(id, fail))
    const checklist = await query<Record<string, unknown>>(`SELECT id,task_id,text,checked,sort_order,
      TO_CHAR(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') created_at
      FROM todo_checklist_items WHERE task_id=$1 ORDER BY sort_order,id`, [id])
    const comments = await query<Record<string, unknown>>(`SELECT id,task_id,author,body,
      TO_CHAR(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') created_at
      FROM todo_comments WHERE task_id=$1 ORDER BY created_at,id`, [id])
    return res.status(200).json({ success: true, task: { ...task, checklist, comments } })
  }

  if (action === 'todo.activity') {
    const requested = Number(req.query.limit || 30)
    const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.trunc(requested))) : 30
    const logs = await query<Record<string, unknown>>(`SELECT id,user_name,action,
      TO_CHAR(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') created_at
      FROM todo_activity_logs ORDER BY created_at DESC,id DESC LIMIT $1`, [limit])
    return res.status(200).json({ success: true, logs })
  }

  mutation(req, auth, fail)
  const input = await requestBody(req, fail)

  if (action === 'todo.create') {
    const title = clean(input.title, 180); const assignedTo = clean(input.assigned_to || auth.user.username, 80)
    const status = statuses.has(String(input.status)) ? String(input.status) : 'backlog'
    const priority = priorities.has(String(input.priority)) ? String(input.priority) : 'medium'
    if (!title || !assignedTo) fail(422, 'Title and assignee are required.')
    const dueDate = optionalDate(input.due_date, fail); const recurring = Boolean(input.is_recurring)
    const recurrence = recurring && recurrencePatterns.has(String(input.recurrence_pattern)) ? String(input.recurrence_pattern) : recurring ? 'weekly' : null
    const order = await query<{ next: number }>('SELECT COALESCE(MAX(sort_order),0)+1 next FROM todo_tasks WHERE status=$1', [status])
    const rows = await query<{ id: string | number }>(`INSERT INTO todo_tasks
      (title,assigned_to,status,sort_order,due_date,description,priority,time_estimate,labels,is_recurring,recurrence_pattern,recurrence_parent_id,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13) RETURNING id`,
      [title, assignedTo, status, Number(order[0]?.next || 1), dueDate, clean(input.description, 5000) || null, priority, clean(input.time_estimate, 40) || null, JSON.stringify(labels(input.labels)), recurring, recurrence, input.recurrence_parent_id ? taskId(input.recurrence_parent_id, fail) : null, auth.user.id])
    const id = Number(rows[0].id); await activity(auth, `${auth.user.username} created "${title}"`)
    return res.status(201).json({ success: true, task: publicTask(await taskById(id, fail)) })
  }

  if (action === 'todo.update') {
    const id = taskId(input.id, fail); const previous = await taskById(id, fail)
    const title = 'title' in input ? clean(input.title, 180) : previous.title
    const assignedTo = 'assigned_to' in input ? clean(input.assigned_to, 80) : previous.assigned_to
    const status = 'status' in input && statuses.has(String(input.status)) ? String(input.status) : previous.status
    const priority = 'priority' in input && priorities.has(String(input.priority)) ? String(input.priority) : previous.priority
    if (!title || !assignedTo) fail(422, 'Title and assignee are required.')
    const dueDate = 'due_date' in input ? optionalDate(input.due_date, fail) : previous.due_date
    const recurring = 'is_recurring' in input ? Boolean(input.is_recurring) : previous.is_recurring
    const recurrence = recurring ? (recurrencePatterns.has(String(input.recurrence_pattern)) ? String(input.recurrence_pattern) : previous.recurrence_pattern || 'weekly') : null
    const newLabels = 'labels' in input ? labels(input.labels) : (Array.isArray(previous.labels) ? previous.labels : [])
    await query(`UPDATE todo_tasks SET title=$1,assigned_to=$2,status=$3,sort_order=$4,due_date=$5,description=$6,priority=$7,time_estimate=$8,
      labels=$9::jsonb,is_recurring=$10,recurrence_pattern=$11,updated_by=$12,updated_at=NOW() WHERE id=$13`,
      [title, assignedTo, status, 'sort_order' in input ? Math.max(0, Number(input.sort_order) || 0) : previous.sort_order, dueDate,
        'description' in input ? clean(input.description, 5000) || null : previous.description, priority,
        'time_estimate' in input ? clean(input.time_estimate, 40) || null : previous.time_estimate,
        JSON.stringify(newLabels), recurring, recurrence, auth.user.id, id])
    if (status === 'completed' && previous.status !== 'completed' && previous.is_recurring && previous.recurrence_pattern) {
      const nextDate = nextRecurringDate(previous.due_date, previous.recurrence_pattern)
      const order = await query<{ next: number }>("SELECT COALESCE(MAX(sort_order),0)+1 next FROM todo_tasks WHERE status='today'")
      await query(`INSERT INTO todo_tasks
        (title,assigned_to,status,sort_order,due_date,description,priority,time_estimate,labels,is_recurring,recurrence_pattern,recurrence_parent_id,created_by)
        VALUES ($1,$2,'today',$3,$4,$5,$6,$7,$8::jsonb,TRUE,$9,$10,$11)`,
        [previous.title, previous.assigned_to, Number(order[0]?.next || 1), nextDate, previous.description, previous.priority, previous.time_estimate,
          JSON.stringify(Array.isArray(previous.labels) ? previous.labels : []), previous.recurrence_pattern, previous.recurrence_parent_id || id, auth.user.id])
      await activity(auth, `${auth.user.username} completed recurring "${title}" — next instance scheduled for ${nextDate}`)
    } else if (status !== previous.status) {
      await activity(auth, `${auth.user.username} moved "${title}" to ${status.replace('_', ' ')}`)
    } else {
      await activity(auth, `${auth.user.username} updated "${title}"`)
    }
    return res.status(200).json({ success: true, task: publicTask(await taskById(id, fail)) })
  }

  if (action === 'todo.delete') {
    const id = taskId(input.id, fail); const task = await taskById(id, fail)
    await query('DELETE FROM todo_tasks WHERE id=$1', [id]); await activity(auth, `${auth.user.username} deleted "${task.title}"`)
    return res.status(200).json({ success: true })
  }

  if (action === 'todo.checklist.add') {
    const id = taskId(input.task_id, fail); await taskById(id, fail); const text = clean(input.text, 240)
    if (!text) fail(422, 'Checklist text is required.')
    const order = await query<{ next: number }>('SELECT COALESCE(MAX(sort_order),0)+1 next FROM todo_checklist_items WHERE task_id=$1', [id])
    const rows = await query<{ id: string | number }>('INSERT INTO todo_checklist_items (task_id,text,sort_order) VALUES ($1,$2,$3) RETURNING id', [id, text, Number(order[0]?.next || 1)])
    return res.status(201).json({ success: true, id: Number(rows[0].id), text, checked: false, sort_order: Number(order[0]?.next || 1) })
  }

  if (action === 'todo.checklist.toggle') {
    const id = taskId(input.id, fail); const rows = await query<{ id: string | number }>('UPDATE todo_checklist_items SET checked=$1 WHERE id=$2 RETURNING id', [Boolean(input.checked), id])
    if (!rows.length) fail(404, 'Checklist item not found.')
    return res.status(200).json({ success: true })
  }

  if (action === 'todo.checklist.delete') {
    const id = taskId(input.id, fail); const rows = await query<{ id: string | number }>('DELETE FROM todo_checklist_items WHERE id=$1 RETURNING id', [id])
    if (!rows.length) fail(404, 'Checklist item not found.')
    return res.status(200).json({ success: true })
  }

  if (action === 'todo.comment.add') {
    const id = taskId(input.task_id, fail); const task = await taskById(id, fail); const comment = clean(input.body, 3000)
    if (!comment) fail(422, 'Comment text is required.')
    const rows = await query<{ id: string | number; created_at: string }>(`INSERT INTO todo_comments (task_id,author,body,user_id) VALUES ($1,$2,$3,$4)
      RETURNING id,TO_CHAR(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') created_at`, [id, auth.user.username, comment, auth.user.id])
    await activity(auth, `${auth.user.username} commented on "${task.title}"`)
    return res.status(201).json({ success: true, comment: { id: Number(rows[0].id), task_id: id, author: auth.user.username, body: comment, created_at: rows[0].created_at } })
  }

  fail(404, 'Unknown To-Do action.')
}
