// ============================================================================
// GEO 工具箱 · 浏览器半边
// 三块：📖 工具选择（默认，带一键填进对话的按钮）+ 📊 审计历史 + 📋 技能目录。
//
// 按钮怎么工作：点击 → startPrompt(prompt) → 宿主 uiWorkspace.startSession(...)
// → 打开新对话并把指令填进输入框（不自动发送，用户补完内容再发）。
// 这是 dsh 插件的通用做法（运营 Agent / 卖家工具箱 / 小红书验证 等都用这一套）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'geo-optimizer'
const BASE = 'geo-optimizer'

// apply() 里注入，按钮点击时调用
let startPrompt = null
function act(prompt) {
  if (startPrompt) startPrompt(prompt)
}

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#5b21b6' }),
    h('circle', { cx: 11, cy: 11, r: 4.5, stroke: '#fff', 'stroke-width': 1.6 }),
    h('path', { d: 'M14.5 14.5L19 19', stroke: '#ffd24a', 'stroke-width': 1.8, 'stroke-linecap': 'round' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

// 三个技能 + 各自的一键指令
const TOOLS = [
  {
    name: '🔍 geo-content-optimizer',
    tag: '单页体检',
    desc: '输入网址，30 秒出优化报告。已有官网、想看 AI 眼里的水平 → 用这个',
    prompt: '用 geo-content-optimizer 体检这个页面：',
    action: '🔍 体检一个页面',
  },
  {
    name: '🛠️ geo-optimizer',
    tag: '全流程优化',
    desc: 'JSON-LD Schema / 内容可读性 / 内容集群 / 可见度监控 / 差距分析 5 大模块。第一次做 GEO，想 AI 带做 → 用这个',
    prompt: '我是做 的，帮我开始 GEO 优化，先给我一份现状诊断和 30 天行动计划。',
    action: '🛠️ 从零开始做 GEO',
  },
  {
    name: '📊 geolook',
    tag: '服务流水线',
    desc: '站点诊断 → AI 答案采样 → 执行工单 → 可部署资产 → 季度报告。长期做 GEO 或接客户 → 用这个',
    prompt: '用 geolook 给这个网站做完整 GEO：',
    action: '📊 跑完整服务流水线',
  },
]

function GuideTab() {
  return h('div', null,
    // 主 CTA：最常用的那个动作，放在最显眼处
    h('div', { style: styles.ctaCard },
      h('div', { style: styles.ctaText },
        h('div', { style: styles.ctaTitle }, '手上有篇稿子，想知道 AI 会不会引用？'),
        h('div', { style: styles.ctaMuted }, '点右边的按钮 → 打开新对话，输入框已填好指令；把你的内容粘在后面回车即可。')),
      h('button', {
        style: styles.ctaButton,
        onClick: () => act('给这篇内容打个 GEO 分：'),
        title: '填进对话：给这篇内容打个 GEO 分：',
      }, '⚡ 给这篇内容打个 GEO 分')),

    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '三个工具怎么选'),
      h('div', { style: styles.toolList },
        TOOLS.map((t) => h('div', { key: t.name, style: styles.toolRow },
          h('div', { style: styles.toolHead },
            h('span', { style: styles.toolName }, t.name),
            h('span', { style: styles.toolTag }, t.tag),
            h('button', { style: styles.actionBtn, onClick: () => act(t.prompt), title: `填进对话：${t.prompt}` }, t.action)),
          h('div', { style: styles.muted }, t.desc))))),

    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, 'GEO 是什么'),
      h('div', { style: { ...styles.muted, lineHeight: 1.9 } },
        'SEO 是让 Google 搜到你，GEO 是让 AI 在回答时"提到你"。',
        h('br'), '68% 的 AI 回答引用来自高权威网站；43% 来自带问答标记的页面。',
        h('br'), '如果 AI 回答里提到你的竞品但没提到你——你就在 AI 时代"隐形"了。')),

    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '也可以直接在对话里说'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '给这篇内容打个 GEO 分：（粘贴正文）'),
        h('div', { style: styles.quote }, '/geo-content-optimizer https://你的网址.com'),
        h('div', { style: styles.quote }, '我是做XX的，帮我开始 GEO 优化'),
        '带 Python 脚本的技能（geo-optimizer / geolook）需先复制技能目录到工作区再执行脚本。')))
}

function SkillsTab() {
  const [skills, setSkills] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson('/api/skills').then((d) => setSkills(d.skills)).catch((e) => setError(e.message))
  }, [])
  return h('div', null,
    error ? h('div', { style: styles.error }, error) : null,
    skills === null ? h('div', { style: styles.muted }, '加载中…') : null,
    skills?.map((s) => h('div', { key: s.name, style: styles.card },
      h('div', { style: styles.skillName }, '/' + s.name),
      s.scriptCount ? h('span', { style: styles.skillTag }, `${s.scriptCount} 个 Python 脚本`) : null,
      h('div', { style: styles.skillDesc }, s.description.length > 220 ? s.description.slice(0, 220) + '…' : s.description))))
}


// ---------- 审计历史 ----------
function fmtTime(iso) {
  try {
    const d = new Date(iso)
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  } catch { return iso || '' }
}
const DIM_LABELS = { citations: '引用数据', structure: '结构化', qa: '问答友好', authority: '权威信号' }

function scoreColor(score) {
  return score >= 70 ? '#1a7f37' : score >= 40 ? '#b58a00' : '#c0392b'
}

function AuditsTab() {
  const [audits, setAudits] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson('/api/audits').then((d) => setAudits(d.audits)).catch((e) => setError(e.message))
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  if (audits === null) return h('div', { style: styles.muted }, '加载中…')
  if (!audits.length) {
    return h('div', null,
      h('div', { style: styles.card },
        h('div', { style: styles.sectionTitle }, '还没有审计记录'),
        h('div', { style: styles.muted }, '点下面的按钮，把指令填进对话，再把正文粘在后面。'),
        h('button', { style: { ...styles.actionBtn, marginTop: 10 }, onClick: () => act('给这篇内容打个 GEO 分：') }, '⚡ 给这篇内容打个 GEO 分')))
  }
  return h('div', null,
    h('div', { style: styles.row },
      h('button', { style: styles.actionBtn, onClick: () => act('给这篇内容打个 GEO 分：') }, '⚡ 再打分一篇')),
    audits.map((r) => h('div', { key: r.id, style: styles.card },
      h('div', { style: styles.row },
        h('span', { style: { fontWeight: 800, fontSize: 20, color: scoreColor(r.score) } }, String(r.score)),
        h('div', null,
          h('div', { style: styles.auditTitle }, r.title),
          h('div', { style: styles.mutedSmall }, fmtTime(r.ts))),
        h('span', { style: { marginLeft: 'auto', ...styles.mutedSmall } },
          Object.entries(r.dimensions || {}).map(([k, v]) => (DIM_LABELS[k] || k) + ' ' + v).join(' · '))),
      (r.findings || []).slice(0, 4).map((f, i) => h('div', { key: i, style: styles.finding }, '- ' + f)))))
}

const TABS = [
  ['guide', '📖 工具选择'],
  ['audits', '📊 审计历史'],
  ['skills', '📋 技能目录'],
]

function Panel() {
  const [tab, setTab] = useState('guide')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.row },
      TABS.map(([key, label]) => h('button', {
        key,
        style: tab === key ? styles.tabActive : styles.tab,
        onClick: () => setTab(key),
      }, label))),
    tab === 'guide' ? h(GuideTab) : tab === 'audits' ? h(AuditsTab) : h(SkillsTab))
}

const styles = {
  auditTitle: { fontWeight: 600, fontSize: 13 },
  finding: { color: '#4a4a50', fontSize: 12, lineHeight: 1.7 },
  mutedSmall: { color: '#a0a0a8', fontSize: 12, lineHeight: 1.7 },
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#5b21b6', color: '#fff', cursor: 'pointer', fontSize: 13 },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #5b21b6', borderRadius: 8, background: '#f3eefc', color: '#4c1d95', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  ctaCard: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: '#f3eefc', border: '1px solid #ddd0f5', borderRadius: 10, padding: '12px 14px', marginBottom: 12 },
  ctaText: { flex: 1, minWidth: 200 },
  ctaTitle: { fontWeight: 700, color: '#4c1d95', marginBottom: 4 },
  ctaMuted: { color: '#7c6f9e', lineHeight: 1.7, fontSize: 12.5 },
  ctaButton: { padding: '10px 20px', border: 'none', borderRadius: 10, background: '#5b21b6', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 2px 6px rgba(91,33,182,.25)' },
  actionBtn: { padding: '5px 12px', border: '1px solid #d9c9f5', borderRadius: 8, background: '#f7f2ff', color: '#4c1d95', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  sectionTitle: { fontWeight: 700, marginBottom: 6, color: '#4c1d95' },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#f3eefc', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#4c1d95', fontFamily: 'Consolas, monospace', fontSize: 12.5 },
  toolList: { display: 'grid', gap: 10 },
  toolRow: { background: '#fafafa', borderRadius: 8, padding: '10px 12px' },
  toolHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  toolName: { fontWeight: 700, color: '#4c1d95', fontFamily: 'Consolas, monospace' },
  toolTag: { padding: '1px 8px', borderRadius: 999, background: '#f3eefc', color: '#4c1d95', fontSize: 11 },
  muted: { color: '#8a8a92' },
  error: { color: '#c0392b' },
  skillName: { fontWeight: 700, color: '#4c1d95', fontFamily: 'Consolas, monospace' },
  skillTag: { marginLeft: 8, padding: '1px 8px', borderRadius: 999, background: '#f3eefc', color: '#4c1d95', fontSize: 11 },
  skillDesc: { marginTop: 4, color: '#4a4a50', lineHeight: 1.5 },
}

function apply(ctx) {
  // 与其它插件同一套入口：只填草稿，不自动发送
  startPrompt = (prompt) => {
    try {
      ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
    } catch (err) {
      console.error('[geo-optimizer] 开新对话失败', err)
      alert('开新对话失败：' + ((err && err.message) || err))
    }
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 18, label: () => 'GEO 工具箱' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
