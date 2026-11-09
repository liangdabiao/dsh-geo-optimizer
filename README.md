# dsh-geo-optimizer · GEO 工具箱

DeepSeek Harness（dsh）插件：**生成式引擎优化（GEO）三个技能**——让 ChatGPT、豆包、Perplexity、文心一言这些 AI 在回答问题时主动提到你。

技能来自 [GEO-Content-Optimizer-Skill](https://github.com/liangdabiao/GEO-Content-Optimizer-Skill)（MIT，liangdabiao；geolook 技能 MIT）。**纯技能零 API key**。


<img width="2487" height="1113" alt="image" src="https://github.com/user-attachments/assets/a1b4cac0-7ce8-4d10-9330-c96185368cf9" />

## GEO vs SEO

**SEO 是让 Google 搜到你，GEO 是让 AI 在回答时"提到你"。** 如果 AI 回答里提到你的竞品但没提到你——你就在 AI 时代"隐形"了。

- 68% 的 AI 回答引用来自高权威网站（BrightEdge 100 万条研究）
- 43% 的引用来自带"问答"标记的页面
- 麦肯锡预测：2026 年 40% 的搜索将通过 AI 完成

## 三个技能怎么选

| 技能 | 定位 | 什么时候用 |
|---|---|---|
| `geo-content-optimizer` | 单页体检 | 已有官网，想看 AI 眼里的水平。输入 URL，30 秒出优化报告 |
| `geo-optimizer` | 全流程优化（4 个 Python 脚本） | 第一次做 GEO，想 AI 一步步带做。JSON-LD Schema/内容可读性/内容集群/可见度监控/差距分析 |
| `geo` (geolook) | 完整服务流水线（18 个 Python 脚本） | 长期做 GEO 或接客户。站点诊断→AI 答案采样→执行工单→可部署资产→季度报告 |

## 使用

对话里一句话：**`/geo-content-optimizer https://你的网址.com`**（单页体检）或**「我是做XX的，帮我开始 GEO 优化」**。

带 Python 脚本的技能：模型会先把技能目录复制到工作区再执行脚本（可见度测试脚本需要用户自己的 LLM API key，从环境变量传入）。

## 安全提醒

上游仓库 .env.example 曾含明文 Kimi API key（已随 GitHub 公开）——本插件**不携带任何密钥**（全局扫描测试防泄露）。如果你用过那对 key，请轮换。

## 自检

```bash
npm install && npm test && npm run selftest && npm run build
```

- `npm test`：9 个单测（快照合规/折叠标量解析/>-变体/scriptCount/泄露 key 扫描/systemPrompt/许可）
- `npm run selftest`：快照+provider+泄露扫描+面板 API，零网络
- `npm run build`：打包 dist/client.js + 三大自检（含 treeShaking:false）


## 安装

```bash
dsh plugin --profile web add dsh-geo-optimizer
```

## 许可

MIT（liangdabiao；geolook 技能 MIT）
