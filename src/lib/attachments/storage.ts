import { randomUUID } from "crypto"
import { mkdir, readFile, unlink, writeFile } from "fs/promises"
import { extname, join, resolve, sep } from "path"

import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/attachments/constants"

const ATTACHMENTS_ROOT = resolve(process.cwd(), "storage", "attachments")

type UploadFile = Blob & {
  name?: string
  type?: string
  size: number
}

function toStorageKey(...parts: string[]) {
  return join(...parts).replace(/\\/g, "/")
}

function resolveStoragePath(storageKey: string) {
  const absolutePath = resolve(ATTACHMENTS_ROOT, storageKey)
  const rootPrefix = `${ATTACHMENTS_ROOT}${sep}`
  if (absolutePath !== ATTACHMENTS_ROOT && !absolutePath.startsWith(rootPrefix)) {
    throw new Error("Invalid attachment storage path")
  }
  return absolutePath
}

function normalizeOriginalName(name: string | undefined) {
  const trimmed = name?.trim() || "attachment"
  return trimmed.replace(/[\\/]+/g, "_")
}

function safeExtension(name: string) {
  const extension = extname(name).toLowerCase()
  return /^[.a-z0-9_-]{0,16}$/.test(extension) ? extension : ""
}

export async function saveExpenseAttachmentFile(args: { companyId: string; expenseId: string; file: UploadFile }) {
  const { companyId, expenseId, file } = args
  const originalName = normalizeOriginalName(file.name)

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error(`Attachment ${originalName} is empty`)
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error(`Attachment ${originalName} exceeds 10 MB`)
  }

  const storageKey = toStorageKey("expenses", companyId, expenseId, `${randomUUID()}${safeExtension(originalName)}`)
  const absolutePath = resolveStoragePath(storageKey)

  await mkdir(join(ATTACHMENTS_ROOT, "expenses", companyId, expenseId), { recursive: true })
  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()))

  return {
    originalName,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    storageKey,
  }
}

export async function readStoredAttachment(storageKey: string) {
  return readFile(resolveStoragePath(storageKey))
}

export async function cleanupStoredAttachments(storageKeys: string[]) {
  await Promise.all(
    [...new Set(storageKeys)].map(async (storageKey) => {
      try {
        await unlink(resolveStoragePath(storageKey))
      } catch {
        // ignore cleanup failures
      }
    }),
  )
}