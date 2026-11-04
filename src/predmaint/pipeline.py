"""End-to-end pipeline: fit normal-behaviour models, score, alarm, evaluate."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from . import anomaly, evaluation, nbm
from .config import resolve_path
from .data import load_events, load_scada, standardise_scada
from .features import add_features, feature_columns, near_event_mask, operating_mask


@dataclass
class Bundle:
    """Everything needed to score new data: models, scales and alarm thresholds."""
    cfg: dict
    mode: str
    signal_models: dict = field(default_factory=dict)  # signal -> SignalModel
    thresholds: dict = field(default_factory=dict)     # component -> float

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: Path) -> "Bundle":
        return joblib.load(path)


def prepare(cfg: dict, scada: pd.DataFrame | None = None) -> pd.DataFrame:
    df = load_scada(cfg) if scada is None else standardise_scada(scada, cfg)
    return add_features(df, cfg)


def _daily_near_event(scores: pd.DataFrame, events: pd.DataFrame, cfg: dict, component: str) -> pd.Series:
    tmp = scores[["asset", "date"]].rename(columns={"date": "timestamp"})
    return near_event_mask(tmp, events, cfg, component)


def threshold_and_alarm(cfg: dict, sc: pd.DataFrame, events: pd.DataFrame, comp: str,
                        quantile: float | None = None) -> tuple[pd.DataFrame, float]:
    """Calibrate the alarm threshold on healthy training days and apply it."""
    sp, a = cfg["split"], cfg["anomaly"]
    sc = sc.drop(columns=["above", "alarm", "threshold"], errors="ignore")
    calib = (sc["date"] >= sp["train_start"]) & (sc["date"] < sp["train_end"])
    calib &= ~_daily_near_event(sc, events, cfg, comp).to_numpy()
    thr = anomaly.calibrate_threshold(sc, calib, quantile or a["threshold_quantile"])
    sc = anomaly.apply_alarms(sc, thr, a["min_consecutive_days"])
    sc["component"] = comp
    return sc, thr


def rethreshold(cfg: dict, scores: pd.DataFrame, events: pd.DataFrame,
                quantile: float | None = None) -> pd.DataFrame:
    """Re-run only the alarm step on saved scores (no model refit needed)."""
    parts = [threshold_and_alarm(cfg, sc, events, comp, quantile)[0]
             for comp, sc in scores.groupby("component")]
    return pd.concat(parts, ignore_index=True)[scores.columns]


@dataclass
class RunResult:
    mode: str
    bundle: Bundle
    scores: pd.DataFrame        # daily scores + alarms, all components (column 'component')
    predictions: pd.DataFrame   # 10-min expected values for each signal
    nbm_metrics: pd.DataFrame   # accuracy of each signal model on healthy test data
    screening: pd.DataFrame     # static offset of each turbine/signal vs. the model (°C)


def fit_and_score(cfg: dict, df: pd.DataFrame, events: pd.DataFrame, mode: str,
                  log=print) -> RunResult:
    sp = cfg["split"]
    ts = df["timestamp"]
    train_period = (ts >= sp["train_start"]) & (ts < sp["train_end"])
    test_period = (ts >= sp["train_end"]) & (ts < sp["test_end"])
    op = operating_mask(df, cfg)
    feats = feature_columns(cfg)
    a = cfg["anomaly"]

    bundle = Bundle(cfg=cfg, mode=mode)
    preds = df[["timestamp", "asset"]].copy()
    metrics, all_scores, screening = [], [], []
    for comp, spec in cfg["components"].items():
        near = near_event_mask(df, events, cfg, comp)
        train_mask = op & train_period & ~near
        daily = []
        for s in spec["signals"]:
            sm, p = nbm.fit_predict(df, train_mask, s, feats, mode, cfg["model"]["lightgbm"],
                                    asset_offset=cfg["model"].get("asset_offset", True))
            bundle.signal_models[s] = sm
            preds[s] = p
            healthy_test = op & test_period & ~near & df[s].notna() & p.notna()
            err = (df[s] - p)[healthy_test]
            y = df.loc[healthy_test, s]
            for asset, off in sm.offsets.items():
                screening.append({"component": comp, "signal": s, "asset": asset, "offset_c": off})
            metrics.append({
                "component": comp, "signal": s, "mae": err.abs().mean(),
                "rmse": float(np.sqrt((err ** 2).mean())),
                "r2": 1 - float((err ** 2).sum() / ((y - y.mean()) ** 2).sum()),
                "n_test": int(healthy_test.sum()),
            })
            daily.append(anomaly.daily_signal_scores(df, p, sm.scale, s, op, a["min_samples_per_day"]))
        sc = anomaly.component_scores(daily, spec["signals"], cfg)
        sc, thr = threshold_and_alarm(cfg, sc, events, comp)
        bundle.thresholds[comp] = thr
        all_scores.append(sc[["asset", "date", "component", "score_raw", "score", "threshold", "above", "alarm"]])
        log(f"  [{mode}] {comp:13s} threshold={thr:5.2f}  alarm days={int(sc['alarm'].sum())}")
    return RunResult(mode, bundle, pd.concat(all_scores, ignore_index=True), preds, pd.DataFrame(metrics),
                     pd.DataFrame(screening))


def any_component(scores: pd.DataFrame) -> pd.DataFrame:
    """Turbine-level view: alarm if any component alarms; score = highest score / threshold."""
    s = scores.assign(rel=scores["score"] / scores["threshold"])
    return (s.groupby(["asset", "date"])
             .agg(score=("rel", "max"), alarm=("alarm", "any")).reset_index())


def evaluate(cfg: dict, scores: pd.DataFrame, events: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    sp, ev_cfg = cfg["split"], cfg["evaluation"]
    W = ev_cfg["warning_window_days"]
    in_test = lambda d, col: (d[col] >= sp["train_end"]) & (d[col] < sp["test_end"])  # noqa: E731
    test_scores = scores[in_test(scores, "date")]
    test_events = events[in_test(events, "start")]

    tables, summary = [], {}
    for comp in cfg["components"]:
        sc = test_scores[test_scores["component"] == comp]
        ev = test_events[(test_events["component"] == comp) & (test_events["kind"] != "major_outage")]
        tbl = evaluation.score_events(ev, sc, W, ev_cfg["min_coverage"])
        eps = evaluation.false_alarms(evaluation.alarm_episodes(sc),
                                      test_events[test_events["component"].isin([comp, "turbine"])], W)
        summary[comp] = evaluation.summarise(tbl, eps, n_asset_days=len(sc))
        tables.append(tbl)

    turb = any_component(test_scores)
    outages = test_events[test_events["kind"] == "major_outage"]
    tbl = evaluation.score_events(outages, turb, W, ev_cfg["min_coverage"])
    eps = evaluation.false_alarms(evaluation.alarm_episodes(turb), test_events, W)
    summary["turbine (any component) vs major outages"] = evaluation.summarise(tbl, eps, len(turb))
    tables.append(tbl)
    tables = [t for t in tables if len(t)]
    thermal = pd.concat([t for t in tables if (t["kind"] != "major_outage").all()] or [tbl.iloc[:0]],
                        ignore_index=True)
    sc_t = thermal.loc[thermal["scorable"].astype(bool)]
    summary["all thermal-alarm events"] = {
        "events_scorable": int(len(sc_t)), "events_caught": int(sc_t["caught"].sum()),
        "detection_rate": round(float(sc_t["caught"].mean()), 3) if len(sc_t) else None,
        "median_lead_days": float(sc_t.loc[sc_t["caught"], "lead_days"].median()) if sc_t["caught"].any() else None,
    }
    return pd.concat(tables, ignore_index=True), summary


def operating_curve(cfg: dict, scores: pd.DataFrame, events: pd.DataFrame,
                    quantiles=(0.9, 0.95, 0.97, 0.98, 0.99, 0.995, 0.998, 0.999)) -> pd.DataFrame:
    """Detection vs false alarms for a range of alarm thresholds.

    Thresholds are always derived from the training period (quantile of the
    training scores), so this shows the trade-off an operator would choose from
    without looking at the test faults.
    """
    rows = []
    for q in quantiles:
        _, summ = evaluate(cfg, rethreshold(cfg, scores, events, q), events)
        t = summ["turbine (any component) vs major outages"]
        th = summ["all thermal-alarm events"]
        rows.append({"quantile": q,
                     "outages_caught": t["events_caught"], "outages_scorable": t["events_scorable"],
                     "thermal_caught": th["events_caught"], "thermal_scorable": th["events_scorable"],
                     "false_alarms_per_turbine_year": t["false_alarms_per_turbine_year"],
                     "median_lead_outage": t["median_lead_days"]})
    return pd.DataFrame(rows)


def score_new_data(bundle: Bundle, scada: pd.DataFrame) -> pd.DataFrame:
    """Score any SCADA table (same columns as in the config) with a fitted bundle."""
    cfg = bundle.cfg
    df = prepare(cfg, scada)
    op = operating_mask(df, cfg)
    a = cfg["anomaly"]
    out = []
    for comp, spec in cfg["components"].items():
        daily = []
        for s in spec["signals"]:
            sm = bundle.signal_models[s]
            daily.append(anomaly.daily_signal_scores(df, sm.predict(df), sm.scale, s, op, a["min_samples_per_day"]))
        sc = anomaly.component_scores(daily, spec["signals"], cfg)
        sc = anomaly.apply_alarms(sc, bundle.thresholds[comp], a["min_consecutive_days"])
        sc["component"] = comp
        out.append(sc[["asset", "date", "component", "score", "threshold", "alarm"]])
    return pd.concat(out, ignore_index=True)


def output_dir(cfg: dict) -> Path:
    p = resolve_path(cfg["output_dir"])
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_run(cfg: dict, res: RunResult) -> None:
    out = output_dir(cfg)
    res.scores.to_parquet(out / f"scores_{res.mode}.parquet", index=False)
    res.predictions.to_parquet(out / f"predictions_{res.mode}.parquet", index=False)
    res.nbm_metrics.to_parquet(out / f"nbm_metrics_{res.mode}.parquet", index=False)
    res.screening.to_parquet(out / f"screening_{res.mode}.parquet", index=False)
    res.bundle.save(resolve_path("models") / cfg["name"] / f"bundle_{res.mode}.joblib")


def load_run(cfg: dict, mode: str) -> dict:
    out = output_dir(cfg)
    return {k: pd.read_parquet(out / f"{k}_{mode}.parquet") for k in ("scores", "predictions", "nbm_metrics", "screening")}


def write_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=str))
