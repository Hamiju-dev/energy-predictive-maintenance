"""End-to-end on a synthetic farm: the tool must catch an injected, slowly developing fault."""

import pandas as pd
import pytest

from predmaint import evaluation, pipeline
from predmaint.config import load_config
from predmaint.data import load_events

from conftest import DRIFT_START, FAULT_ASSET, FAULT_EVENT


@pytest.mark.parametrize("mode", ["fleet", "self"])
def test_injected_fault_is_caught_early(farm, mode):
    path, _, _ = farm
    cfg = load_config(path, overrides={"model": {"mode": mode}})
    df = pipeline.prepare(cfg)
    events = load_events(cfg)
    res = pipeline.fit_and_score(cfg, df, events, mode, log=lambda *_: None)
    table, summary = pipeline.evaluate(cfg, res.scores, events)

    row = table[(table["asset"] == FAULT_ASSET) & (table["component"] == "gearbox")].iloc[0]
    assert row["scorable"] and row["caught"]
    assert row["lead_days"] >= 10  # warned at least 10 days before the event

    # the faulty turbine gets a sustained alarm episode that starts after the drift began
    test = res.scores[res.scores["date"] >= "2021-01-01"]
    eps = evaluation.alarm_episodes(test)
    long_eps = eps[eps["days"] >= 10]
    assert set(long_eps["asset"]) == {FAULT_ASSET}
    assert long_eps["start"].min() >= DRIFT_START

    # healthy turbines: only short, isolated blips (a 99th-percentile threshold allows a few)
    assert summary["gearbox"]["false_alarms_per_turbine_year"] <= 3


def test_saved_bundle_scores_new_data(farm, tmp_path):
    path, scada, _ = farm
    cfg = load_config(path)
    df = pipeline.prepare(cfg)
    res = pipeline.fit_and_score(cfg, df, load_events(cfg), "fleet", log=lambda *_: None)
    p = tmp_path / "bundle.joblib"
    res.bundle.save(p)

    new = scada[(scada["time"] >= "2021-08-15") & (scada["time"] < FAULT_EVENT)]
    out = pipeline.score_new_data(pipeline.Bundle.load(p), new)
    days = out[out["alarm"]].groupby("asset").size()
    assert days.get(FAULT_ASSET, 0) >= 10
    others = days.drop(FAULT_ASSET, errors="ignore")
    assert others.empty or others.max() <= 3
    assert {"asset", "date", "component", "score", "threshold", "alarm"} <= set(out.columns)


def test_missing_column_gives_clear_error(farm):
    path, scada, _ = farm
    cfg = load_config(path)
    with pytest.raises(KeyError, match="T_gbx_oil"):
        pipeline.prepare(cfg, scada.drop(columns="T_gbx_oil"))


def test_baseline_mode_runs(farm):
    path, _, _ = farm
    cfg = load_config(path)
    df = pipeline.prepare(cfg)
    res = pipeline.fit_and_score(cfg, df, load_events(cfg), "baseline", log=lambda *_: None)
    assert res.scores["score"].notna().all()
    assert isinstance(res.scores["date"].iloc[0], pd.Timestamp)
