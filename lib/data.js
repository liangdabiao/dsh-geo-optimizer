// GEO 工具箱 · 审计历史持久化（$DSH_HOME/geo-optimizer/）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'geo-optimizer')
const HIST_FILE = join(DATA_DIR, 'audits.json')
const MAX_RECORDS = 100

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function load() {
  try {
    const raw = JSON.parse(readFileSync(HIST_FILE, 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function save(list) {
  ensureDirs()
  const tmp = `${HIST_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8')
  renameSync(tmp, HIST_FILE)
}

export function listAudits() {
  return load()
}

export function saveAudit({ title, score, dimensions, findings, contentPreview }) {
  const list = load()
  const record = {
    id: `audit-${Date.now()}`,
    title: String(title || '未命名').slice(0, 100),
    score,
    dimensions,
    findings,
    contentPreview: String(contentPreview || '').slice(0, 300),
    ts: new Date().toISOString(),
  }
  list.unshift(record)
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS
  save(list)
  return record
}

export function deleteAudit(id) {
  const list = load()
  const next = list.filter((r) => r.id !== id)
  if (next.length === list.length) return false
  save(next)
  return true
}
