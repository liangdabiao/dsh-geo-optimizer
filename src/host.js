// GEO 工具箱 · Host 半边（最小宿主：技能 + 硬规则注入 + 面板数据面）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'

export const name = 'geo-optimizer'

export const inject = ['skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入 GEO 方法论到系统提示'),
})

export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)

  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: methodology`)
  }

  ctx.effect(() => registerApi(ctx, { skillDirs }), `${name}: routes`)
}
