let csrfToken = ''

export function setCsrfToken(value: string) {
  csrfToken = value
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(action: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (csrfToken && !['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase())) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  const queryIndex = action.indexOf('&')
  const actionName = queryIndex === -1 ? action : action.slice(0, queryIndex)
  const extraQuery = queryIndex === -1 ? '' : `&${action.slice(queryIndex + 1)}`
  const response = await fetch(`/api/index.php?action=${encodeURIComponent(actionName)}${extraQuery}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() }

  if (!response.ok) {
    throw new ApiError(data.error || 'The request could not be completed.', response.status)
  }
  return data as T
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatRelativeDate(date: string) {
  const value = new Date(date.replace(' ', 'T') + (date.includes('Z') ? '' : 'Z'))
  const diff = Date.now() - value.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return value.toLocaleDateString()
}
