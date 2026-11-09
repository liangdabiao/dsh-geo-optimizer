// 面板数据面：/geo-optimizer 前缀路由（技能目录 + 302.AI 配置）。
import { readDir } from './skills.js'
import { listAudits } from './data.js'
import { envStatus, syncFromConfig, upsertEnv, FLASH_MODELS, STRONG_MODELS } from './env.js'

const BASE = '/geo-optimizer'

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}

export function registerApi(ctx, { skillDirs, config = {} }) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'

        if (path === '/api/health' && req.method === 'GET') {
          return json(res, 200, { ok: true })
        }
        if (path === '/api/audits' && req.method === 'GET') {
          return json(res, 200, { audits: listAudits() })
        }
        if (path === '/api/skills' && req.method === 'GET') {
          const skills = skillDirs.flatMap((dir) => readDir(dir)).map((s) => ({
            name: s.name,
            description: s.description,
            scriptCount: s.scriptCount,
          }))
          return json(res, 200, { count: skills.length, skills })
        }

        // ---- 302.AI 配置：面板里填 key，写进 skills/geolook/.env ----
        if (path === '/api/env' && req.method === 'GET') {
          return json(res, 200, { ...envStatus(config), models: FLASH_MODELS })
        }
        if (path === '/api/env' && req.method === 'POST') {
          let body = {}
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch {
            return json(res, 400, { error: '请求体不是合法 JSON' })
          }
          const { ai302aiKey, openrouterKey } = body
          if (ai302aiKey !== undefined && typeof ai302aiKey !== 'string') {
            return json(res, 400, { error: 'ai302aiKey 必须是字符串' })
          }
          if (ai302aiKey) {
            const r = syncFromConfig({ ai302aiKey, openrouterKey, useFastModels: body.useFastModels !== false })
            if (!r.written) return json(res, 400, { error: '写入 .env 失败' })
          } else if (body.models) {
            // 只切模型档（不动 key）
            const table = body.useFastModels === false ? STRONG_MODELS : FLASH_MODELS
            upsertEnv(table)
          }
          return json(res, 200, { ok: true, ...envStatus({ ...config, ...body }) })
        }

        json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: err?.message || '内部错误' })
      }
    },
  })
}
