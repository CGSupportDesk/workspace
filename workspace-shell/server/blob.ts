import { createReadStream } from 'node:fs'
import { copy, del, get, put } from '@vercel/blob'

function token() {
  const value = process.env.BLOB_READ_WRITE_TOKEN
  if (!value) throw new Error('BLOB_READ_WRITE_TOKEN is not configured.')
  return value
}

export async function uploadPrivateBlob(pathname: string, filePath: string, contentType: string, multipart = false) {
  return put(pathname, createReadStream(filePath), {
    access: 'private',
    contentType,
    multipart,
    token: token(),
    addRandomSuffix: false,
  })
}

export async function copyPrivateBlob(source: string, pathname: string, contentType: string) {
  return copy(source, pathname, { access: 'private', contentType, token: token(), addRandomSuffix: false })
}

export async function deletePrivateBlobs(paths: string[]) {
  if (paths.length) await del(paths, { token: token() })
}

export async function getPrivateBlob(path: string) {
  return get(path, { access: 'private', token: token(), useCache: false })
}

