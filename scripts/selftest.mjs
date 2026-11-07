// 离线自检：快照 + provider + 泄露扫描 + 面板 API。零网络零 key。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_ROOT = join(ROOT, 'skills')
const { createSkillProvider } = await import('../lib/skills.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try {
    await fn()
    console.log('ok')
  } catch (err) {
    failed++
    console.log('失败')
    console.error(`  ${err.message}`)
  }
}

await step('快照完整（3 个 GEO 技能 + LICENSE）', () => {
  for (const name of ['geo-content-optimizer', 'geo-optimizer', 'geolook']) {
    if (!existsSync(join(SKILLS_ROOT, name, 'SKILL.md'))) throw new Error(`缺 ${name}`)
  }
  if (!existsSync(join(SKILLS_ROOT, 'geolook', 'LICENSE'))) throw new Error('缺 geolook LICENSE')
})

const provider = createSkillProvider([SKILLS_ROOT])
let candidates
await step('provider 注册（3 技能逐个读取）', async () => {
  candidates = await provider.list()
  if (candidates.length !== 3) throw new Error(`候选 ${candidates.length} ≠ 3`)
  for (const c of candidates) {
    const skill = await provider.get(c)
    if (skill.content.length < 2000) throw new Error(`${c.name} 正文过短`)
  }
})

await step('上游泄露 key 全局扫描', () => {
  const LEAKED = 'sk-g' + 'Ev9' // 打乱写避免自匹配
  function* walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) yield* walk(p)
      else yield p
    }
  }
  for (const file of walk(SKILLS_ROOT)) {
    if (file === import.meta.filename) continue
    if (readFileSync(file, 'utf8').includes(LEAKED)) throw new Error(`泄露 key 出现在 ${file}`)
  }
})

await step('面板 API 健康/技能目录（内存 ctx 模拟）', async () => {
  const { registerApi } = await import('../lib/api.js')
  const captured = []
  const fakeRes = { writeHead() { return this }, end(chunk) { captured.push(String(chunk)) } }
  const fakeCtx = {
    get: () => ({ requestRejection: () => false }),
    webServer: { register: async ({ handler }) => { globalThis.__geoHandler = handler } },
  }
  await registerApi(fakeCtx, { skillDirs: [SKILLS_ROOT] })
  const handler = globalThis.__geoHandler
  if (!handler) throw new Error('路由未注册')
  await handler({ method: 'GET', url: '/geo-optimizer/api/health', headers: {} }, fakeRes)
  if (!JSON.parse(captured.at(-1)).ok) throw new Error('health 错误')
  captured.length = 0
  await handler({ method: 'GET', url: '/geo-optimizer/api/skills', headers: {} }, fakeRes)
  if (JSON.parse(captured.at(-1)).count !== 3) throw new Error('技能目录数量错')
})

if (failed > 0) {
  console.error(`\n自检失败 ${failed} 项`)
  process.exit(1)
}
console.log('\n全部通过。')
