"""预算闸门的单测：这一层坏了就会退回「闷头跑两小时」。"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import budget as B  # noqa: E402


def test_profiles_scale_down():
    """三档的题量、页数、平台数必须是单调递增的。"""
    q = [B.PROFILES[k]["per_group"] for k in ("quick", "standard", "deep")]
    p = [B.PROFILES[k]["pages"] for k in ("quick", "standard", "deep")]
    assert q == sorted(q) and p == sorted(p)
    assert B.PROFILES["quick"]["per_group"] < B.PROFILES["deep"]["per_group"]


def test_default_profile_exists():
    assert B.DEFAULT_PROFILE in B.PROFILES
    assert B.profile(None)["name"] == B.DEFAULT_PROFILE
    # 未知档位退回默认，不许崩
    assert B.profile("nope")["name"] == B.DEFAULT_PROFILE


def test_platforms_for_market():
    assert "kimi" in B.platforms_for("quick", "cn")
    assert "perplexity" in B.platforms_for("quick", "global")
    both = B.platforms_for("standard", "both")
    assert "kimi" in both and "perplexity" in both


def test_concurrency_capped():
    assert B.concurrency(1, 3) == 3
    assert B.concurrency(5, 3) == 12          # 封顶，别把上游打爆
    assert B.concurrency(0, 3) == 1


def test_estimate_scales_with_calls():
    one = B.estimate_sampling(7, ["kimi"], 1, 3)
    two = B.estimate_sampling(14, ["kimi"], 1, 3)
    assert two["calls"] == 2 * one["calls"]
    assert two["minutes"] >= one["minutes"]


def test_estimate_accounts_for_failures():
    """预估必须比「纯成功耗时」高——实测约 20% 调用要付满超时。"""
    est = B.estimate_sampling(10, ["kimi"], 1, 1)
    clean = 10 * B.PLATFORM_SEC["kimi"] / B.concurrency(1, 1)
    assert est["seconds"] > clean


def test_pipeline_includes_sampling():
    est = B.estimate_pipeline("quick", "cn", 12, 7)
    keys = [s["key"] for s in est["steps"]]
    assert "sample" in keys, "采样步骤不能从预估里消失"
    assert est["minutes"] > 0


def test_pipeline_without_questions_has_no_sampling():
    est = B.estimate_pipeline("quick", "cn", 12, 0)
    assert "sample" not in [s["key"] for s in est["steps"]]


def test_need_confirm_threshold():
    est = {"minutes": 30}
    assert B.need_confirm(est, 10) is True
    assert B.need_confirm(est, 60) is False
    assert B.need_confirm(est, None) is False


def test_guard_rejects_when_over_budget_non_interactive(monkeypatch):
    """非交互 + 超预算 → 必须拒绝（退出码 2），不能静默继续。"""
    class NoTTY:
        def isatty(self):
            return False

    monkeypatch.setattr(sys, "stdin", NoTTY())
    with pytest.raises(SystemExit) as ei:
        B.guard({"minutes": 99, "steps": [], "profile": "deep", "profile_label": "深度",
                 "market": "cn", "pages": 40, "questions": 28}, budget_minutes=5)
    assert ei.value.code == 2


def test_guard_allows_yes(monkeypatch):
    class NoTTY:
        def isatty(self):
            return False

    monkeypatch.setattr(sys, "stdin", NoTTY())
    B.guard({"minutes": 99, "steps": [], "profile": "deep", "profile_label": "深度",
             "market": "cn", "pages": 40, "questions": 28}, budget_minutes=5, assume_yes=True)


def test_guard_noop_under_budget():
    B.guard({"minutes": 3, "steps": []}, budget_minutes=20)   # 不抛异常即可


def test_timer_summary_labels_interval_by_next_mark():
    t = B.Timer()
    t.mark("start")
    t.mark("建项目")
    t.mark("采样")
    out = t.summary()
    assert "建项目" in out and "采样" in out
