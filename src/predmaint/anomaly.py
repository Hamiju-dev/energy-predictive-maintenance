"""Turn model residuals into a daily component health score and alarms.

1. residual z-score per 10-min sample: (actual - expected) / robust scale
2. daily mean over normal-operation samples (days with too little data are skipped)
3. component score = mean (or max) over the component's signals
4. exponential smoothing (half-life in days) to suppress one-off noise
5. alarm when the smoothed score exceeds a threshold calibrated on the training
   period for ``min_consecutive_days`` scored days in a row.

Only *positive* deviations (running hotter than expected) raise alarms.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def daily_signal_scores(df: pd.DataFrame, pred: pd.Series, scale: float, signal: str,
                        op_mask: pd.Series, min_samples: int) -> pd.DataFrame:
    z = (df[signal] - pred) / scale
    ok = op_mask & z.notna()
    d = pd.DataFrame({"asset": df.loc[ok, "asset"], "date": df.loc[ok, "timestamp"].dt.floor("D"),
                      "z": z[ok]})
    g = d.groupby(["asset", "date"])["z"].agg(["mean", "size"]).reset_index()
    g = g[g["size"] >= min_samples]
    return g.rename(columns={"mean": signal, "size": f"n_{signal}"})[["asset", "date", signal]]


def component_scores(signal_daily: list[pd.DataFrame], signals: list[str], cfg: dict) -> pd.DataFrame:
    """Combine per-signal daily z-scores into one smoothed component score."""
    a = cfg["anomaly"]
    out = None
    for sd in signal_daily:
        out = sd if out is None else out.merge(sd, on=["asset", "date"], how="outer")
    if out is None or out.empty:
        return pd.DataFrame(columns=["asset", "date", "score_raw", "score"])
    vals = out[signals]
    out["score_raw"] = vals.max(axis=1) if a.get("aggregate") == "max" else vals.mean(axis=1)
    out = out.dropna(subset=["score_raw"])
    return smooth(out, cfg)


def remove_common_mode(scores: pd.DataFrame, min_assets: int = 3) -> pd.Series:
    """Subtract the fleet's daily median score (common-mode rejection).

    Weather the model has not fully captured, fleet-wide ageing or a sensor
    firmware change move all turbines together; a developing fault moves one.
    Days with fewer than ``min_assets`` turbines reporting are left unchanged.
    """
    g = scores.groupby("date")["score_raw"]
    med, n = g.transform("median"), g.transform("size")
    return scores["score_raw"] - med.where(n >= min_assets, 0.0)


def smooth(scores: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """(Optional common-mode removal) + exponential smoothing -> ``score``."""
    a = cfg["anomaly"]
    out = scores.sort_values(["asset", "date"]).copy()
    base = remove_common_mode(out) if a.get("common_mode") else out["score_raw"]
    hl = pd.Timedelta(days=a["ewm_halflife_days"])
    out["score"] = (
        base.groupby(out["asset"]).transform(
            lambda s: s.ewm(halflife=hl, times=out.loc[s.index, "date"]).mean())
    )
    return out.reset_index(drop=True)


def calibrate_threshold(scores: pd.DataFrame, calib_mask: pd.Series, quantile: float) -> float:
    """Alarm level = median over turbines of each turbine's training-score quantile.

    Pooling all turbines and taking one quantile would let a single turbine that is
    already faulty during training (it has the highest scores) set the bar for the
    whole fleet. The median of per-turbine quantiles is robust to that.
    """
    s = scores.loc[calib_mask, ["asset", "score"]].dropna()
    if s.empty:
        raise ValueError("no training-period scores to calibrate the alarm threshold")
    per_asset = s.groupby("asset")["score"].quantile(quantile)
    return float(np.median(per_asset))


def apply_alarms(scores: pd.DataFrame, threshold: float, min_consecutive: int) -> pd.DataFrame:
    """Add ``above`` and ``alarm`` columns (persistence over consecutive scored days)."""
    scores = scores.sort_values(["asset", "date"]).copy()
    scores["above"] = scores["score"] > threshold
    alarm = np.zeros(len(scores), dtype=bool)
    pos = 0
    for _, g in scores.groupby("asset", sort=False):
        run = 0
        for i, (above, gap) in enumerate(zip(g["above"].to_numpy(),
                                             g["date"].diff().dt.days.fillna(1).to_numpy())):
            run = run + 1 if above and gap <= 3 else (1 if above else 0)
            alarm[pos + i] = run >= min_consecutive
        pos += len(g)
    scores["alarm"] = alarm
    scores["threshold"] = threshold
    return scores
