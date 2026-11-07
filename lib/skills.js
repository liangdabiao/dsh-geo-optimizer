// GEO 工具箱 · 技能快照提供方（3 个 GEO 技能）。
// 纯技能零 API key——分析由模型完成；Python 脚本由模型在工作区副本执行（geolook/geo-optimizer）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  // 单行 description（排除折叠标量标记 ">" / ">" / "|" / "|-" / ">-" / ">+"）
  const descLine = block.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  let description = descLine && !/^[-+]?[>|]$/.test(descLine) && !/^[>|][-+]$/.test(descLine)
    ? descLine.replace(/^(["'])(.*)\1$/, '$2').trim() : null
  if (!description) {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => /^description:\s*>/.test(l))
    if (start !== -1) {
      const collected = []
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) break
        collected.push(lines[i].replace(/^\s+/, ''))
      }
      description = collected.join(' ').trim()
    }
  }
  if (!name || !description) return null
  // 剥掉 allowed-tools 行（Claude Code 概念，dsh 不用）
  const body = text.slice(m[0].length)
  return { name, description, body }
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sDir = join(dir, entry.name)
    const skillFile = join(sDir, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const parsed = parse(skillFile)
    if (!parsed) continue
    const scriptCount = existsSync(join(sDir, 'scripts'))
      ? readdirSync(join(sDir, 'scripts')).filter((f) => f.endsWith('.py')).length
      : 0
    out.push({ dir: sDir, file: skillFile, ...parsed, dirName: entry.name, scriptCount })
  }
  return out
}

function addendum(skill) {
  const lines = [
    '',
    '---',
    '',
    '## 在 DSH 插件里使用',
    '',
    `- 本技能目录：\`${skill.dir}\`；references/ 与 docs/ 附属文档用文件读取工具按需加载。`,
    '- 正文提到的 WebSearch / mcp__playwright__* 等工具：有则用，没有时降级——请用户粘贴页面内容或用 dsh 网络工具，数据缺口如实标注。',
    '- 分析报告与生成的 Schema/内容资产**输出到当前工作区**（如 `output/<域名>/`），不要往插件安装目录写文件。',
  ]
  if (skill.scriptCount > 0) {
    lines.push(
      `- 本技能带 ${skill.scriptCount} 个 Python 脚本：**沙箱读不到插件安装目录**——先把技能目录复制到工作区再执行：`,
      '  ```bash',
      `  cp -r "${skill.dir}" ./geo-skill && cd geo-skill`,
      '  ```',
      '- 脚本依赖见各脚本文件头；AI 可见度测试类脚本需要用户自己的 LLM API key（从环境变量传入，不要硬编码）。',
    )
  }
  lines.push('')
  return lines.join('\n')
}

export function createSkillProvider(dirs) {
  const list = [].concat(dirs)
  const candidate = (s, scriptCount) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'geo-optimizer',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir },
    scriptCount,
  })

  return {
    name: 'geo-optimizer',
    async list() {
      return list.flatMap(readDir).map((s) => {
        const c = candidate(s, s.scriptCount)
        const { scriptCount, ...rest } = c
        return rest
      })
    },
    async get(c) {
      const s = list.flatMap(readDir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = s.body + addendum(s)
      const { rank, locator, scriptCount, ...summary } = candidate(s, s.scriptCount)
      return { ...summary, content, scriptCount }
    },
  }
}

export { readDir, addendum }
