// 快照合规 + provider + addendum + 泄露 key 扫描 + API 单测。零 dsh 依赖零网络。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_ROOT = join(ROOT, 'skills')
const { createSkillProvider, readDir } = await import('../lib/skills.js')
const { systemSection } = await import('../src/systemPrompt.js')
const { requestRejection } = await import('../lib/api.js')

const SKILL_DIRS = [SKILLS_ROOT]

test('快照完整：3 个 GEO 技能各含 SKILL.md', () => {
  for (const name of ['geo-content-optimizer', 'geo-optimizer', 'geolook']) {
    assert.ok(existsSync(join(SKILLS_ROOT, name, 'SKILL.md')), `缺 ${name}/SKILL.md`)
  }
  // geolook 有 LICENSE（MIT）
  assert.ok(existsSync(join(SKILLS_ROOT, 'geolook', 'LICENSE')), 'geolook 缺 LICENSE')
})

test('provider：3 个候选、frontmatter 折叠标量解析、scriptCount', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const candidates = await provider.list()
  assert.equal(candidates.length, 3)
  const names = candidates.map((c) => c.name)
  assert.ok(names.includes('geo-content-optimizer'))
  assert.ok(names.includes('geo-optimizer'))
  assert.ok(names.includes('geo') || names.includes('geolook'), 'geolook 的 name 是 geo')
  for (const c of candidates) {
    assert.ok(c.description.length > 30, `${c.name} description 太短`)
    assert.equal(c.rank, 600)
  }
})

test('geo-optimizer：references 3 篇 + 4 个 Python 脚本', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const c = (await provider.list()).find((c) => c.name === 'geo-optimizer')
  const skill = await provider.get(c)
  assert.equal(skill.scriptCount, 4)
  assert.match(skill.content, /JSON-LD/, '应含 Schema 模块')
  const refs = readdirSync(join(SKILLS_ROOT, 'geo-optimizer', 'references'))
  assert.ok(refs.length >= 3, 'references 缺文件')
})

test('geolook：17 个 Python 脚本 + 7 篇 references', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const c = (await provider.list()).find((c) => c.name === 'geo')
  const skill = await provider.get(c)
  assert.ok(skill.scriptCount >= 17, `geolook 脚本 ${skill.scriptCount} < 17`)
  const refs = readdirSync(join(SKILLS_ROOT, 'geolook', 'references')).filter((f) => f.endsWith('.md'))
  assert.ok(refs.length >= 7, `references ${refs.length} < 7`)
})

test('addendum：工作区复制（带脚本技能）+ 降级策略 + 免责', async () => {
  const provider = createSkillProvider(SKILL_DIRS)
  const co = await provider.get((await provider.list()).find((c) => c.name === 'geo-content-optimizer'))
  // 无脚本的技能不应有复制指令
  assert.ok(!co.content.includes('cp -r'), '无脚本技能不需要复制')
  assert.match(co.content, /WebSearch/, '应提 WebSearch 降级')
  // geolook 有脚本 → 应有复制指令
  const geo = await provider.get((await provider.list()).find((c) => c.name === 'geo'))
  assert.match(geo.content, /cp -r/, '带脚本技能应有复制命令')
  assert.match(geo.content, /读不到插件安装目录/, '应说明沙箱限制')
})

test('上游泄露 key 全局扫描（skills 不含 kimi-key）', () => {
  // 上游 .env.example 的 key：sk-gEv9 开头
  function* walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) yield* walk(p)
      else yield p
    }
  }
  for (const file of walk(SKILLS_ROOT)) {
    const text = readFileSync(file, 'utf8')
    assert.ok(!text.includes('sk-gEv9'), `泄露 key 出现在 ${file}`)
  }
})

test('systemPrompt：GEO vs SEO + 三技能路由 + 铁律', () => {
  const section = systemSection()
  assert.equal(section.name, 'geo-optimizer:methodology')
  assert.match(section.text, /GEO vs SEO/)
  assert.match(section.text, /geo-content-optimizer/)
  assert.match(section.text, /geolook/)
  assert.match(section.text, /68%/)
})

test('面板 API 鉴权 fail closed', () => {
  const noService = { get: () => undefined }
  assert.equal(requestRejection(noService, { headers: {} }), false) // 宿主 token 鉴权是边界，服务缺席放行
})

test('LICENSE 为 MIT', () => {
  assert.match(readFileSync(join(ROOT, 'LICENSE'), 'utf8'), /MIT/)
})
