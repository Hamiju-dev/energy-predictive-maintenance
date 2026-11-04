"""Failure prediction with lead time: P(fault event in the next N days) per turbine-day.

Builds a daily table per turbine from the component health scores (output of the
anomaly step) and trains a classifier on the training period, tested on the
later period. To check that the health scores carry real information, three
feature sets are compared:

* ``season``  : ambient temperature, load, day of year. Many temperature alarms are
                simply "hot summer at full load", so this is the bar to beat.
* ``health``  : component health scores (level, 7-day change, 14-day max).
* ``combined``: both.

Usage:  python -m predmaint.prediction configs/fuhrlander.yaml [mode]
"""

from __future__ import annotations

import sys

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import pipeline
from .config import load_config, resolve_path
from .data import load_events
from .features import operating_mask


def daily_table(cfg: dict, df: pd.DataFrame, scores: pd.DataFrame, events: pd.DataFrame,
                horizon: int) -> pd.DataFrame:
    rel = scores.assign(rel=scores["score"] / scores["threshold"])
    wide = rel.pivot_table(index=["asset", "date"], columns="component", values="rel").sort_index()
    feats = {}
    for comp in wide.columns:
        s = wide[comp]
        g = s.groupby(level="asset")
        feats[f"{comp}_score"] = s
        feats[f"{comp}_change_7d"] = s - g.shift(7)
        feats[f"{comp}_max_14d"] = g.rolling(14, min_periods=1).max().droplevel(0)
    X = pd.DataFrame(feats)
    X["max_score"] = wide.max(axis=1)
    X["n_components_above_1"] = (wide > 1).sum(axis=1)

    op = operating_mask(df, cfg)
    ctx = (df.assign(date=df["timestamp"].dt.floor("D"), op=op)
             .groupby(["asset", "date"]).agg(ambient=("ambient_temp", "mean"),
                                             ambient_max=("ambient_temp", "max"),
                                             load=("power_frac", "mean"),
                                             op_share=("op", "mean")))
    X = X.join(ctx, how="left").reset_index()
    doy = X["date"].dt.dayofyear
    X["doy_sin"], X["doy_cos"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)

    # label: an event (thermal alarm or outage) starts within the next `horizon` days
    X["y"] = 0
    X["ongoing"] = False
    for e in events.itertuples():
        a = X["asset"] == e.asset
        s0 = e.start.floor("D")
        X.loc[a & (X["date"] < s0) & (X["date"] >= s0 - pd.Timedelta(days=horizon)), "y"] = 1
        X.loc[a & (X["date"] >= s0) & (X["date"] <= e.end.floor("D")), "ongoing"] = True
    return X[~X["ongoing"]].drop(columns="ongoing")


FEATURE_SETS = {
    "season": ["ambient", "ambient_max", "load", "doy_sin", "doy_cos"],
}


def run(cfg: dict, mode: str = "fleet") -> tuple[pd.DataFrame, pd.DataFrame]:
    df = pipeline.prepare(cfg)
    events = load_events(cfg)
    scores = pipeline.load_run(cfg, mode)["scores"]
    H = cfg["prediction"]["horizon_days"]
    X = daily_table(cfg, df, scores, events, H)
    health = [c for c in X.columns if c.endswith(("_score", "_change_7d", "_max_14d"))] + \
             ["max_score", "n_components_above_1"]
    sets = {"season": FEATURE_SETS["season"], "health": health, "combined": FEATURE_SETS["season"] + health}

    sp = cfg["split"]
    tr = (X["date"] >= sp["train_start"]) & (X["date"] < sp["train_end"])
    te = (X["date"] >= sp["train_end"]) & (X["date"] < sp["test_end"])
    rows, preds = [], X.loc[te, ["asset", "date", "y"]].copy()
    for name, cols in sets.items():
        for model_name, model in {
            "logistic": make_pipeline(StandardScaler(), LogisticRegression(C=0.3, max_iter=2000,
                                                                           class_weight="balanced")),
            "lightgbm": lgb.LGBMClassifier(n_estimators=150, learning_rate=0.03, num_leaves=7,
                                           min_child_samples=30, subsample=0.8, subsample_freq=1,
                                           colsample_bytree=0.8, verbose=-1),
        }.items():
            Xtr = X.loc[tr, cols].fillna(X.loc[tr, cols].median())
            Xte = X.loc[te, cols].fillna(X.loc[tr, cols].median())
            model.fit(Xtr, X.loc[tr, "y"])
            p = model.predict_proba(Xte)[:, 1]
            preds[f"{name}_{model_name}"] = p
            y = X.loc[te, "y"]
            # alarm budget: threshold so that 10 % of training days would be flagged
            thr = np.quantile(model.predict_proba(Xtr)[:, 1], 0.9)
            rows.append({"features": name, "model": model_name,
                         "roc_auc": roc_auc_score(y, p), "pr_auc": average_precision_score(y, p),
                         "base_rate": y.mean(),
                         "recall_at_10pct_budget": float(((p >= thr) & (y == 1)).sum() / max(y.sum(), 1)),
                         "precision_at_10pct_budget": float(((p >= thr) & (y == 1)).sum() / max((p >= thr).sum(), 1)),
                         "n_train_pos": int(X.loc[tr, "y"].sum()), "n_test_pos": int(y.sum()),
                         "n_test": int(len(y))})
    return pd.DataFrame(rows), preds


def figure(res: pd.DataFrame) -> None:
    import matplotlib.pyplot as plt

    from .report import C, _save, style
    style()
    r = res[res["model"] == "logistic"].set_index("features").loc[["season", "health", "combined"]]
    colors = {"season": C["neutral"], "health": C["s1"], "combined": C["s2"]}
    labels = {"season": "Season & load only", "health": "Health scores only", "combined": "Both"}
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    for ax, metric, title, ref in [
        (axes[0], "roc_auc", "ROC AUC (0.5 = coin flip)", 0.5),
        (axes[1], "pr_auc", "Average precision (dashed = random)", r["base_rate"].iloc[0]),
    ]:
        x = np.arange(len(r))
        ax.bar(x, r[metric], color=[colors[i] for i in r.index], width=0.6)
        for i, v in enumerate(r[metric]):
            ax.text(i, v + 0.01, f"{v:.2f}", ha="center", va="bottom", fontsize=9, color=C["ink"])
        ax.axhline(ref, color=C["ink2"], lw=1, ls="--")
        ax.set_xticks(x, [labels[i] for i in r.index], fontsize=9)
        ax.set_title(title, fontsize=11)
        ax.grid(axis="x", visible=False)
        ax.set_ylim(0, max(1.0 if metric == "roc_auc" else r[metric].max() * 1.35, ref * 1.2))
    fig.suptitle("Predicting a fault event in the next 14 days (test period 2013–2014, logistic regression)",
                 x=0.06, ha="left", fontweight="bold")
    fig.tight_layout()
    _save(fig, "10_failure_prediction.png")


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    cfg = load_config(argv[0])
    mode = argv[1] if len(argv) > 1 else "fleet"
    res, preds = run(cfg, mode)
    pd.set_option("display.width", 200)
    print(res.round(3).to_string(index=False))
    out = resolve_path("reports") / f"prediction_{cfg['name']}.md"
    from .report import _md_table
    out.write_text(f"# Failure prediction ({mode} health scores)\n\n"
                   f"Target: thermal alarm or major outage starting within the next "
                   f"{cfg['prediction']['horizon_days']} days (turbine-day level). Train {cfg['split']['train_start']}"
                   f"–{cfg['split']['train_end']}, test until {cfg['split']['test_end']}.\n\n"
                   + _md_table(res.round(3)) + "\n")
    figure(res)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
