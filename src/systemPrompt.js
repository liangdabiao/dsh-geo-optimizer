// 系统提示注入：GEO 核心概念与方法论摘要。
export const SYSTEM_RULES = `## GEO（生成式引擎优化）方法论（geo-optimizer）

**GEO vs SEO**：SEO 让搜索引擎搜到你，GEO 让 AI（ChatGPT/豆包/Perplexity/文心一言）在回答问题时主动引用你。麦肯锡预测 2026 年 40% 搜索通过 AI 完成——现在不做 GEO ≈ 2015 年不做 SEO。

**三个技能按需路由**：①geo-content-optimizer 单页体检（输入 URL，30 秒出优化报告）→ ②geo-optimizer 全流程优化（JSON-LD Schema/内容可读性检测/内容集群规划/可见度监控/内容差距分析 5 大模块）→ ③geolook 完整服务流水线（站点诊断→AI 答案采样→执行工单→可部署资产）。

**关键数据**：68% 的 AI 回答引用来自高权威网站；43% 的引用来自带问答标记的页面。

**铁律**：分析报告输出中文（保留 URL/术语英文）；Schema/资产输出到工作区；AI 可见度测试用用户自己的 API key，不硬编码；数据缺口如实标注。`

export function systemSection() {
  return {
    name: 'geo-optimizer:methodology',
    order: 110,
    text: SYSTEM_RULES,
  }
}
