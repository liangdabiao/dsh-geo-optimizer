"""开工前的预算闸门：先算「要跑多久、要调多少次 AI」，再决定跑不跑。

为什么需要这个模块
------------------
GEO 全流程里最贵的一步是 AI 答案采样：单题 60-120 秒（推理型模型更久）。
默认 24 题 × 5 平台 = 120 次调用，平台内串行时就是两小时起步。

问题不是「跑得慢」，是**没在开工前把代价告诉用户**。所以这里做三件事：

1. **三档 profile**：quick / standard / deep，把默认量砍到「一次交付 20 分钟内」；
2. **预估表**：采样开跑前先算清调用次数与分钟数，逐平台列出来；
3. **闸门**：预估超预算时，交互终端里问 y/N，非交互环境直接拒绝并给缩量指令
   （绝不闷头跑两小时）。`--yes` 表示「我知道，跑吧」。

口径纪律：预估值是**估算**，不是承诺。表格标题必须带「约」字，
且要在跑完之后打印实测耗时做对照——估算偏差超过 50% 要改这里的系数。
"""

from __future__ import annotations

import sys

# 每类步骤的耗时系数（秒），来源：2026-11 实测 5 个国内引擎的原生延迟
# 采样均值按「无联网」和「带检索」分开，带检索的慢一倍以上
PLATFORM_SEC = {
    # 国内
    "glm": 60, "doubao": 95, "deepseek": 90, "kimi": 35, "minimax": 80,
    # 海外
    "gemini": 30, "openai": 35, "claude": 35, "grok": 40, "perplexity": 30,
}
DEFAULT_PLATFORM_SEC = 60

# 三档预设。改这里的数字就能整体调档，不用动业务代码。
PROFILES = {
    "quick": {
        "label": "快速",
        "minutes_hint": "约 5 分钟",
        "pages": 12,
        "per_group": 1,          # 七组各 1 题 → 7-9 题
        "platforms": {
            "cn": ["kimi", "doubao"],
            "global": ["perplexity", "openai"],
            "both": ["kimi", "doubao", "perplexity"],
        },
        "sample_minutes": 6,
        "drafts": 0,
    },
    "standard": {
        "label": "标准",
        "minutes_hint": "约 10 分钟",
        "pages": 20,
        "per_group": 2,          # 七组各 2 题 → 14 题
        "platforms": {
            "cn": ["kimi", "doubao", "glm"],
            "global": ["perplexity", "openai", "gemini"],
            "both": ["kimi", "doubao", "perplexity", "openai"],
        },
        "sample_minutes": 12,
        "drafts": 0,
    },
    "deep": {
        "label": "深度",
        "minutes_hint": "约 20 分钟",
        "pages": 40,
        "per_group": 4,          # 七组各 4 题 → 24-28 题
        "platforms": {
            "cn": ["glm", "doubao", "deepseek", "kimi", "minimax"],
            "global": ["perplexity", "openai", "claude", "gemini", "grok"],
            "both": ["glm", "doubao", "kimi", "perplexity", "openai"],
        },
        "sample_minutes": 40,
        "drafts": 0,
    },
}
DEFAULT_PROFILE = "standard"


def profile(name: str | None) -> dict:
    """取档位配置。未知档位一律退回默认，且 name 必须如实反映实际用的档位
    （否则预估表和实测日志会写着 deep 其实跑的是 standard）。"""
    key = name if name in PROFILES else DEFAULT_PROFILE
    p = dict(PROFILES[key])
    p["name"] = key
    return p


def platforms_for(profile_name: str | None, market: str) -> list[str]:
    p = profile(profile_name)
    plats = p["platforms"].get(market) or p["platforms"]["cn"]
    return list(plats)


def avg_platform_sec(platforms: list[str]) -> float:
    if not platforms:
        return DEFAULT_PLATFORM_SEC
    return sum(PLATFORM_SEC.get(p, DEFAULT_PLATFORM_SEC) for p in platforms) / len(platforms)


def concurrency(platform_count: int, per_platform: int = 3, cap: int = 12) -> int:
    """平台间并发 × 平台内并发，封顶 cap 路（再高容易触发上游限流）。"""
    return max(1, min(platform_count * max(1, per_platform), cap))


FAIL_RATE = 0.2  # 实测约 20% 的调用会超时/报错，每次都要付满超时时间


def estimate_sampling(questions: int, platforms: list[str], repeat: int = 1,
                      per_platform: int = 3) -> dict:
    calls = max(0, questions) * max(0, len(platforms)) * max(1, repeat)
    conc = concurrency(len(platforms), per_platform)
    # 失败的那部分也要占满超时时间，不加上这项预估会系统性偏乐观
    sec = calls * avg_platform_sec(platforms) * (1 + FAIL_RATE) / conc
    return {"calls": calls, "concurrency": conc, "seconds": round(sec, 1),
            "minutes": round(sec / 60, 1)}


def estimate_pipeline(profile_name: str | None, market: str, pages: int,
                      questions: int, repeat: int = 1, drafts: int = 0,
                      per_platform: int = 3) -> dict:
    """全流程预估。steps 里每一步都带明细，用户能看懂时间花在哪。"""
    p = profile(profile_name)
    plats = platforms_for(profile_name, market)
    steps = [
        {"key": "crawl", "name": "抓取官网", "minutes": round(pages * 2.2 / 60, 2),
         "detail": f"{pages} 页 × 约 2.2s（同域串行、礼貌延迟）"},
        {"key": "audit", "name": "六维体检 ×2", "minutes": round(pages * 0.3 / 60, 2),
         "detail": f"{pages} 页 × 2 遍"},
        {"key": "bootstrap", "name": "自动推导底座（3 次 LLM，并行+快模型）", "minutes": 1.8,
         "detail": "品牌事实 1 次 + 竞品/问题库并行 2 次；--skip-llm 可整段跳过"},
    ]
    if questions:
        est = estimate_sampling(questions, plats, repeat, per_platform)
        steps.append({"key": "sample", "name": "AI 答案采样", "minutes": est["minutes"],
                      "detail": f"{questions} 题 × {len(plats)} 平台 × {repeat} 轮 = {est['calls']} 次调用"
                                f"；{est['concurrency']} 路并发"})
    if drafts:
        steps.append({"key": "draft", "name": "LLM 文章初稿", "minutes": round(drafts * 45 / 60, 1),
                      "detail": f"{drafts} 篇 × 约 45s"})
    steps += [
        {"key": "assets", "name": "工单 / 蓝图 / 资产", "minutes": 0.4, "detail": "确定性生成，几乎不耗"},
        {"key": "report", "name": "报告 / 交付物 / 打包", "minutes": 0.3, "detail": "确定性生成"},
    ]
    total = round(sum(s["minutes"] for s in steps), 1)
    return {"profile": p["name"], "profile_label": p["label"], "market": market,
            "platforms": plats, "pages": pages, "questions": questions,
            "steps": steps, "minutes": total, "sampling": (
                estimate_sampling(questions, plats, repeat, per_platform) if questions else {})}


def table(est: dict) -> str:
    lines = [
        f"预估耗时（profile={est['profile']}｜{est['profile_label']}｜市场 {est['market']}）：约 {est['minutes']} 分钟",
        "",
        f"  {'步骤':<22}{'约':>7}   明细",
        f"  {'-' * 22}{'-' * 7}   {'-' * 40}",
    ]
    for s in est["steps"]:
        lines.append(f"  {s['name']:<22}{s['minutes']:>6.1f}分   {s['detail']}")
    lines.append("")
    lines.append("  预估值是估算，不是承诺；跑完会打印实测耗时供对照。")
    return "\n".join(lines)


def need_confirm(est: dict, budget_minutes: float | None) -> bool:
    """超过预算就要用户点头。预算默认取 profile 的 sample_minutes。"""
    if budget_minutes is None:
        return False
    return est["minutes"] > budget_minutes


def guard(est: dict, budget_minutes: float | None, assume_yes: bool = False,
          stream=None, show_table: bool = True) -> None:
    """闸门。超预算时：--yes 放行；交互终端问 y/N；非交互直接拒绝。

    show_table=False 用于调用方已经打印过预估表的情况，避免同一张表刷两遍。
    """
    if not need_confirm(est, budget_minutes):
        return
    out = stream or sys.stderr
    if show_table:
        print(table(est), file=out)
        print("", file=out)
    print(f"⚠ 预估 {est['minutes']} 分钟，超过预算 {budget_minutes} 分钟。", file=out)
    if assume_yes:
        print("已指定 --yes，继续（出事别怪没人提醒）。", file=out)
        return
    hint = (
        "缩量方式（任选其一）：\n"
        "  --profile quick                 # 七组各 1 题、只跑 2 个平台、抓 12 页\n"
        "  --limit 8                       # 只跑前 8 题\n"
        "  --platforms kimi,doubao         # 只跑指定平台\n"
        "  --no-sample                     # 只要体检与方案，不要 AI 可见度基线\n"
        "  --budget 30                     # 明确接受 30 分钟\n"
        "  --yes                           # 我知道要这么久，别问了"
    )
    interactive = sys.stdin is not None and sys.stdin.isatty()
    if interactive:
        print("继续跑吗？[y/N] ", file=out, end="", flush=True)
        try:
            ans = input().strip().lower()
        except (EOFError, KeyboardInterrupt):
            ans = ""          # stdin 被关闭/管道 EOF 时按「不跑」处理，fail closed
            interactive = False
        if ans in ("y", "yes"):
            return
        if ans in ("n", "no", ""):
            raise SystemExit("已取消（没跑任何东西）。要缩量见下面👇\n" + hint)
    print("非交互环境不跑超预算的长任务，已拒绝。\n" + hint, file=out)
    raise SystemExit(2)


class Timer:
    """极简分步计时：跑完打印实测，用于校准上面的估算系数。"""

    def __init__(self):
        self.marks: list[tuple[str, float]] = []
        import time
        self._time = time.monotonic

    def mark(self, name: str):
        self.marks.append((name, self._time()))

    def summary(self) -> str:
        if len(self.marks) < 2:
            return ""
        lines = ["", "实测耗时："]
        for (n1, t1), (n2, t2) in zip(self.marks, self.marks[1:]):
            lines.append(f"  {n2:<22}{(t2 - t1) / 60:>6.1f} 分钟")
        lines.append(f"  {'合计':<22}{(self.marks[-1][1] - self.marks[0][1]) / 60:>6.1f} 分钟")
        return "\n".join(lines)
