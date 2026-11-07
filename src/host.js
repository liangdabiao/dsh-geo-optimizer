// GEO 工具箱 · Host 半边（技能 + 硬规则注入 + geo_audit 原生工具 + 面板数据面）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { auditContent } from '../lib/audit.js'
import { listAudits, saveAudit, deleteAudit } from '../lib/data.js'

export const name = 'geo-optimizer'

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入 GEO 方法论到系统提示'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`geo_audit 参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：审计明细/历史列表' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

// ---------------------------------------------------------------------------
// 工具：geo_audit —— 内容 GEO 审计（确定性打分）+ 审计历史
// ---------------------------------------------------------------------------
export const geoAuditTool = {
  name: 'geo_audit',
  description:
    '对内容做 GEO（生成式引擎优化）审计打分（0-100，确定性规则）：引用与数据（30）+ 结构化（30）+ 问答友好（25）+ 权威信号（15），' +
    '并给出可执行的改进清单。用户问「这篇内容 AI 会不会引用」「GEO 打个分」「优化这篇稿子」时先用它打基线分，改完再跑一遍对比。审计自动入历史。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('audit 审计打分；compare 对比两次审计；history 审计历史；delete 删除记录', { enum: ['audit', 'compare', 'history', 'delete'] }),
      content: str('audit：要审计的内容全文（markdown）'),
      title: str('audit：可选，内容标题（进历史）'),
      before_id: str('compare：改前那次审计的 id（history 里能看到）'),
      content_after: str('compare：改后的内容全文'),
      id: str('delete：审计记录 id'),
      limit: num('history：最多返回条数，默认 15'),
      confirm: str('delete 必须传 "yes"', { enum: ['yes'] }),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    if (args.action === 'history') {
      const list = listAudits().slice(0, args.limit || 15)
      if (!list.length) return result(true, '还没有审计记录。audit 一篇内容即可。')
      return result(true, `共 ${listAudits().length} 条审计：`,
        list.map((r) => `- ${r.ts} ${r.title}：${r.score} 分（id=${r.id}）`).join('\n'))
    }
    if (args.action === 'delete') {
      if (!args.id) throw new Error('delete 需要 id。')
      if (args.confirm !== 'yes') return result(false, '删除记录请用 confirm:"yes"。')
      return deleteAudit(args.id) ? result(true, `审计记录 ${args.id} 已删除。`) : result(false, `没有记录 ${args.id}。`)
    }
    if (args.action === 'compare') {
      if (!args.before_id || args.content_after === undefined) throw new Error('compare 需要 before_id（改前记录 id）和 content_after（改后全文）。')
      const before = listAudits().find((r) => r.id === args.before_id)
      if (!before) return result(false, `没有改前记录 ${args.before_id}（先 history 找 id）。`)
      const after = auditContent(args.content_after, { title: before.title })
      saveAudit({ title: before.title, score: after.score, dimensions: after.dimensions, findings: after.findings, contentPreview: args.content_after })
      const delta = after.score - before.score
      const dims = Object.keys(after.dimensions).map((k) => `${label(k)} ${before.dimensions[k] ?? '?'}→${after.dimensions[k]}`).join(' · ')
      return result(true, `对比结果：${before.score} → ${after.score}（${delta >= 0 ? '+' : ''}${delta} 分）。${dims}。`,
        after.findings.length ? '仍可改进：\n' + after.findings.map((f) => `- ${f}`).join('\n') : '各维度已达标。')
    }
    // audit
    if (args.content === undefined) throw new Error('audit 需要 content（要审计的全文）。')
    const verdict = auditContent(args.content, { title: args.title })
    saveAudit({ title: args.title, score: verdict.score, dimensions: verdict.dimensions, findings: verdict.findings, contentPreview: args.content })
    const dims = Object.entries(verdict.dimensions).map(([k, v]) => `${label(k)} ${v}`).join(' · ')
    return result(true, `GEO 审计：${verdict.score}/100（${dims}）。改进清单见明细。`,
      verdict.findings.length ? verdict.findings.map((f) => `- ${f}`).join('\n') : '各维度已达标。')
  },
}

function label(key) {
  return { citations: '引用数据', structure: '结构化', qa: '问答友好', authority: '权威信号' }[key] || key
}

const skillDirsRef = { dirs: [] }

export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]
  skillDirsRef.dirs = skillDirs

  ctx.effect(() => ctx.tools.register(geoAuditTool), `${name}: tool audit`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)

  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: methodology`)
  }

  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
