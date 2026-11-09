// 面板设置 → skills/geolook/.env 的同步层。
//
// 为什么要有这一层：Python 侧的管线只认 .env，而用户在 DSH 设置面板里
// 填的是插件 Config。两边不打通的话，用户「填了 key 却还是缺 API Key」——
// 这正是之前缺一块配置入口的问题。
//
// 纪律：
//  1. 只写白名单键，不清空用户手写的其它内容（注释/代理/渠道全保留）
//  2. 永不在日志/接口里回显明文 key，只回显尾号
//  3. 文件权限尽量收紧（Windows 上 chmod 无效，捕获异常略过）

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// flash / mini 版：结构化抽取、单题问答这类任务够用，速度是推理版的 3-5 倍。
// 名字必须是 302.AI 模型目录里真实存在的 id（2026-11 核对）。
export const FLASH_MODELS = {
  AI302AI_GLM_MODEL: 'glm-5.3-flash',
  AI302AI_DEEPSEEK_MODEL: 'deepseek-v4-1-flash-260910',
  AI302AI_ARK_MODEL: 'doubao-seed-2-1-turbo-260628',
  AI302AI_KIMI_MODEL: 'kimi-k3',
  AI302AI_MINIMAX_MODEL: 'MiniMax-M3',
  AI302AI_GEMINI_MODEL: 'gemini-3.8-flash',
  AI302AI_OPENAI_MODEL: 'gpt-5.4-mini',
  AI302AI_CLAUDE_MODEL: 'claude-haiku-5-5',
  AI302AI_GROK_MODEL: 'grok-4-1-fast-non-reasoning',
  AI302AI_PERPLEXITY_MODEL: 'sonar',
}

// 深度档用的强模型：长文分析、对比页这类，慢一点但质量高
export const STRONG_MODELS = {
  AI302AI_GLM_MODEL: 'glm-5.2',
  AI302AI_DEEPSEEK_MODEL: 'deepseek-v4-pro',
  AI302AI_ARK_MODEL: 'doubao-seed-2-1-turbo-260628',
  AI302AI_KIMI_MODEL: 'kimi-k3',
  AI302AI_MINIMAX_MODEL: 'MiniMax-M3',
  AI302AI_GEMINI_MODEL: 'gemini-3.6-flash',
  AI302AI_OPENAI_MODEL: 'gpt-5.4-mini',
  AI302AI_CLAUDE_MODEL: 'claude-sonnet-5',
  AI302AI_GROK_MODEL: 'grok-4.5',
  AI302AI_PERPLEXITY_MODEL: 'sonar',
}

export function skillEnvPath() {
  return join(here, '..', 'skills', 'geolook', '.env')
}

export function readEnvFile(path = skillEnvPath()) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=(.*)$/.exec(line)
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

/** 按 key 更新 .env：保留注释与顺序，缺的追加到末尾。 */
export function upsertEnv(pairs, path = skillEnvPath()) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const lines = existing ? existing.split(/\r?\n/) : []
  const pending = new Map(Object.entries(pairs).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  const seen = new Set()

  const next = lines.map((line) => {
    const m = /^\s*([A-Za-z0-9_]+)\s*=/.exec(line)
    if (!m || !pending.has(m[1])) return line
    seen.add(m[1])
    return `${m[1]}=${pending.get(m[1])}`
  })
  for (const [k, v] of pending) {
    if (!seen.has(k)) next.push(`${k}=${v}`)
  }
  writeFileSync(path, next.join('\n').replace(/\n{3,}$/, '\n'), 'utf8')
  try {
    chmodSync(path, 0o600)
  } catch {
    /* Windows 上无效，忽略 */
  }
  return path
}

/** 把面板设置写进 .env。空 key 不写（不覆盖用户已有的）。 */
export function syncFromConfig(config = {}) {
  const { ai302aiKey, openrouterKey, useFastModels } = config
  const pairs = {}
  if (ai302aiKey) {
    pairs.AI302AI_MODE = '1'
    pairs.AI302AI_API_KEY = ai302aiKey
  }
  if (openrouterKey) {
    pairs.OPENROUTER_MODE = '1'
    pairs.OPENROUTER_API_KEY = openrouterKey
  }
  if (ai302aiKey || openrouterKey) {
    Object.assign(pairs, useFastModels === false ? STRONG_MODELS : FLASH_MODELS)
  }
  if (!Object.keys(pairs).length) return { written: false, path: skillEnvPath() }
  return { written: true, path: upsertEnv(pairs) }
}

/** 面板展示用：永远不回显明文 key。 */
export function envStatus(config = {}) {
  const env = readEnvFile()
  const key = config.ai302aiKey || env.AI302AI_API_KEY || ''
  return {
    configured: Boolean(key),
    keyTail: key ? `••••${key.slice(-4)}` : '',
    mode: env.AI302AI_MODE === '1' || Boolean(config.ai302aiKey) ? '302.AI' : '未配置',
    sampleProfile: config.sampleProfile || 'standard',
    useFastModels: config.useFastModels !== false,
    modelExample: (config.useFastModels === false ? STRONG_MODELS : FLASH_MODELS).AI302AI_GLM_MODEL,
    envPath: skillEnvPath(),
  }
}
