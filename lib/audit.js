// GEO 工具箱 · 内容审计（确定性打分规则，源自 GEO 方法论：引用统计/结构化/问答块/可信信号）。

// 对一段内容做 GEO（生成式引擎优化）审计。
// 维度（各占一定权重，0-100 分）：
//  - citations 引用与数据：数字/百分比/年份/来源（来源名出现在文中）越多越可信
//  - structure 结构化：标题层级、列表、表格、分段
//  - qa 问答友好：问句标题、FAQ、定义句（「X 是…」）
//  - authority 权威信号：来源链接、数据出处、专业术语密度
export function auditContent(content, { title = '' } = {}) {
  const text = String(content || '')
  const errors = []
  if (!text.trim()) return { ok: false, score: 0, dimensions: {}, findings: ['内容为空'] }

  const findings = []
  let score = 0

  // ── citations 引用与数据（30 分）────────────────────────
  const numbers = (text.match(/\d+(\.\d+)?%|\d{4}\s*年|\d+(\.\d+)?\s*(倍|万|亿|次|人|元|美元|天|小时)/g) || []).length
  const sources = (text.match(/据\s*[\u4e00-\u9fa5A-Za-z0-9]{2,20}|来源[:：]|报告显示|研究显示|根据\s*\S{2,15}/g) || []).length
  const citations = Math.min(30, numbers * 3 + sources * 5)
  score += citations
  if (citations < 10) findings.push(`引用与数据偏弱（数字/年份 ${numbers} 处、来源表述 ${sources} 处）——加入具体数据和出处能显著提升 AI 引用率`)
  else if (citations < 20) findings.push('引用与数据中等：再补 1-2 个带出处的统计数字')

  // ── structure 结构化（30 分）───────────────────────────
  const headings = (text.match(/^#{1,6}\s.+$/gm) || []).length
  const bullets = (text.match(/^\s*([-*+]|\d+\.)\s/gm) || []).length
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim()).length
  const structure = Math.min(30, headings * 6 + Math.min(bullets, 10) * 2 + (paras >= 5 ? 6 : paras * 1.5))
  score += structure
  if (headings < 2) findings.push(`标题层级少（${headings} 个 markdown 标题）——加小标题让 AI 更容易摘引`)
  if (bullets < 3) findings.push(`列表条目少（${bullets} 条）——要点列表是 AI 偏好的摘引格式`)

  // ── qa 问答友好（25 分）────────────────────────────────
  const questions = (text.match(/^[^\n]*?[？?]\s*$/gm) || []).length
  const defs = (text.match(/[\u4e00-\u9fa5A-Za-z]{2,20}(是指|是指的是|的定义是|是一种)/g) || []).length
  const faq = /faq|常见问题|q[：:]|问[:：]/i.test(text) ? 8 : 0
  const qa = Math.min(25, questions * 6 + defs * 5 + faq)
  score += qa
  if (qa < 10) findings.push('问答友好度低——加 FAQ 块或「X 是…」定义句，直接命中用户的提问式搜索')

  // ── authority 权威信号（15 分）──────────────────────────
  const links = (text.match(/https?:\/\/[^\s)]+/g) || []).length
  const terms = (text.match(/(ROI|CTR|GEO|SEO|LLM|AIGC|E-E-A-T|转化率|留存率|复购率)/g) || []).length
  const authority = Math.min(15, links * 5 + Math.min(terms, 5) * 2)
  score += authority
  if (authority < 6) findings.push('权威信号弱——补充来源链接与领域关键指标')

  // 标题缺失
  if (!title && !headings) findings.push('没有标题——给内容一个包含核心关键词的明确标题')

  return {
    ok: true,
    score: Math.round(Math.min(100, score)),
    dimensions: { citations, structure, qa, authority },
    findings,
  }
}
