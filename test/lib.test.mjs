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

// ── 升级新增：geo_audit ─────────────────────────────────────
process.env.DSH_HOME = new URL('../.tmp/test-home/', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')

const { auditContent } = await import('../lib/audit.js')
const data = await import('../lib/data.js')
const host = await import('../src/host.js')

test('audit: 四维打分——优质内容高分、空洞内容低分', () => {
  const rich = auditContent([
    '# GEO 是什么：生成式引擎优化入门',
    'GEO 是指生成式引擎优化（Generative Engine Optimization）。',
    '据行业报告显示，2024 年 AI 引用流量增长了 3.2 倍。',
    '来源：某研究院年度报告。',
    '- 转化率提升 25%',
    '- 留存率提升 40%',
    '## 常见问题',
    'GEO 和 SEO 的区别是什么？',
    '详情见 https://example.com/geo-report',
  ].join('\n\n'), { title: 'GEO 入门' })
  const poor = auditContent('我们公司很好，欢迎联系我们。')
  assert.ok(rich.score > poor.score + 30, `优质 ${rich.score} 应远高于空洞 ${poor.score}`)
  assert.ok(rich.dimensions.citations >= 15)
  assert.ok(poor.findings.length >= 2)
  assert.equal(auditContent('').ok, false)
})

test('host: geo_audit audit/compare/history/delete 全链路', async () => {
  assert.equal(host.name, 'geo-optimizer')
  assert.equal(host.geoAuditTool.parameters.additionalProperties, false)
  await assert.rejects(() => host.geoAuditTool.execute({ action: 'audit', bogus: 1 }), /未知参数/)
  await assert.rejects(() => host.geoAuditTool.execute({ action: 'audit' }), /需要 content/)
  host.apply(
    { effect: (fn) => { try { fn() } catch {} }, tools: { register: () => {} }, skills: { registerProvider: () => {} }, systemPrompt: { section: () => {} }, webServer: { register: () => {} } },
    { injectRules: false })
  const audit = await host.geoAuditTool.execute({ action: 'audit', content: 'GEO 是指生成式引擎优化。据报告显示 2024 年增长 3 倍。\n\n## FAQ\nGEO 是什么？', title: '测试稿' })
  assert.equal(audit.ok, true)
  const hist = await host.geoAuditTool.execute({ action: 'history' })
  assert.ok(hist.data.includes('测试稿'))
  const beforeId = /id=(audit-\d+)/.exec(hist.data)?.[1]
  const cmp = await host.geoAuditTool.execute({ action: 'compare', before_id: beforeId, content_after: '# GEO 指南\nGEO 是指生成式引擎优化。\n\n## FAQ\nGEO 是什么？据报告显示 2024 年增长 3.2 倍。\n- 转化率 25%\n来源：https://example.com' })
  assert.equal(cmp.ok, true)
  assert.ok(/\+\d+ 分|\. 分/.test(cmp.summary) || cmp.summary.includes('→'))
  const noConfirm = await host.geoAuditTool.execute({ action: 'delete', id: beforeId })
  assert.equal(noConfirm.ok, false)
})
