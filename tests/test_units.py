import numpy as np
import pandas as pd
import pytest

from predmaint import anomaly, evaluation
from predmaint.config import load_config


def _scores(values, asset="A", start="2021-01-01"):
    d = pd.date_range(start, periods=len(values), freq="D")
    return pd.DataFrame({"asset": asset, "date": d, "score": values})


def test_demo_config_is_valid():
    cfg = load_config("configs/fuhrlander.yaml")
    assert cfg["model"]["mode"] == "fleet"
    assert "gearbox" in cfg["components"]
    # defaults are merged in
    assert cfg["anomaly"]["aggregate"] == "mean"


def test_template_config_is_valid():
    assert load_config("configs/template.yaml")["name"] == "my_farm"


def test_config_rejects_missing_roles(tmp_path):
    p = tmp_path / "bad.yaml"
    p.write_text("name: x\ndata: {scada_path: a.csv}\nroles: {power: P}\nrated_power_kw: 1\n"
                 "components: {g: {signals: [t]}}\nsplit: {train_start: a, train_end: b, test_end: c}\n")
    with pytest.raises(ValueError, match="roles.wind_speed"):
        load_config(p)


def test_alarm_needs_persistence():
    s = _scores([0, 2, 0, 2, 2, 2, 0])
    out = anomaly.apply_alarms(s, threshold=1.0, min_consecutive=2)
    assert out["alarm"].tolist() == [False, False, False, False, True, True, False]


def test_alarm_counter_resets_after_long_data_gap():
    d = pd.to_datetime(["2021-01-01", "2021-01-20"])
    s = pd.DataFrame({"asset": "A", "date": d, "score": [2.0, 2.0]})
    out = anomaly.apply_alarms(s, threshold=1.0, min_consecutive=2)
    assert not out["alarm"].any()


def test_component_score_is_mean_of_signals():
    d = pd.date_range("2021-01-01", periods=3, freq="D")
    a = pd.DataFrame({"asset": "A", "date": d, "s1": [1.0, 2.0, 3.0]})
    b = pd.DataFrame({"asset": "A", "date": d, "s2": [3.0, 2.0, 1.0]})
    cfg = {"anomaly": {"ewm_halflife_days": 1, "aggregate": "mean"}}
    out = anomaly.component_scores([a, b], ["s1", "s2"], cfg)
    assert np.allclose(out["score_raw"], 2.0)
    assert np.allclose(out["score"], 2.0)


def test_lead_time_and_coverage():
    sc = _scores([0] * 40, start="2021-01-01")
    sc["alarm"] = False
    sc.loc[sc["date"] >= "2021-01-21", "alarm"] = True  # alarm from 20 Jan onwards
    ev = pd.DataFrame({"asset": ["A"], "component": ["g"], "kind": ["x"], "description": [""],
                       "start": [pd.Timestamp("2021-02-05 13:00")], "end": [pd.Timestamp("2021-02-06")]})
    t = evaluation.score_events(ev, sc, window_days=30, min_coverage=0.5)
    assert t.loc[0, "caught"] and t.loc[0, "scorable"]
    assert t.loc[0, "lead_days"] == 15  # 21 Jan -> 5 Feb

    sparse = sc.iloc[::5]
    t2 = evaluation.score_events(ev, sparse, window_days=30, min_coverage=0.5)
    assert not t2.loc[0, "scorable"]


def test_false_alarm_classification():
    sc = _scores([0] * 60)
    sc["alarm"] = False
    sc.loc[5:7, "alarm"] = True      # far from any event -> false alarm
    sc.loc[40:42, "alarm"] = True    # 10 days before event -> true warning
    ev = pd.DataFrame({"asset": ["A"], "start": [pd.Timestamp("2021-02-22")], "end": [pd.Timestamp("2021-02-23")]})
    eps = evaluation.false_alarms(evaluation.alarm_episodes(sc), ev, window_days=30)
    assert eps["false_alarm"].tolist() == [True, False]
    summ = evaluation.summarise(pd.DataFrame(columns=evaluation.EVENT_COLUMNS), eps, n_asset_days=365)
    assert summ["false_alarm_episodes"] == 1
    assert summ["precision"] == 0.5
