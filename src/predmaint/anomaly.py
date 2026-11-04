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
    out = out.dropna(subset=["score_raw"]).sort_values(["asset", "date"])
    hl = pd.Timedelta(days=a["ewm_halflife_days"])
    out["score"] = (
        out.groupby("asset", group_keys=False)
        .apply(lambda g: g["score_raw"].ewm(halflife=hl, times=g["date"]).mean(), include_groups=False)
    )
    return out.reset_index(drop=True)


def calibrate_threshold(scores: pd.DataFrame, calib_mask: pd.Series, quantile: float) -> float:
    s = scores.loc[calib_mask, "score"].dropna()
    if s.empty:
        raise ValueError("no training-period scores to calibrate the alarm threshold")
    return float(np.quantile(s, quantile))


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
