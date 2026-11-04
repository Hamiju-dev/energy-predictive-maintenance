"""Normal-behaviour models (NBM): expected component temperature given operating conditions.

For every monitored signal we learn ``temperature = f(power, wind, rotor speed,
ambient temperature, recent load)`` on healthy data. The residual
``actual - expected`` is then close to zero for a healthy component; a component
that runs persistently hotter than expected is degrading (friction, lubrication,
cooling problems, ...).

Three modes:

* ``fleet``    - for turbine *a*, the model is trained on the *other* turbines
                 (leave-one-turbine-out). It answers "how hot would a healthy
                 sister turbine run right now?" and also catches faults that were
                 already present when the training data was recorded.
* ``self``     - classic NBM, each turbine is compared with its own history.
* ``baseline`` - no model, the expected value is the turbine's average training
                 temperature. Used to show what the model adds.

Training-period predictions are always out-of-sample (other turbines in fleet
mode, blocked monthly folds in self mode), so the alarm thresholds calibrated on
them are realistic.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import lightgbm as lgb
import numpy as np
import pandas as pd

ALL = "__all__"


@dataclass
class SignalModel:
    signal: str
    mode: str
    features: list[str]
    models: dict = field(default_factory=dict)  # asset (or ALL) -> fitted model / constant
    scale: float = 1.0  # robust std of out-of-sample training residuals
    offsets: dict = field(default_factory=dict)  # asset -> static offset vs. model (°C)
    use_offset: bool = True

    def _predict_asset(self, X: pd.DataFrame, asset) -> np.ndarray:
        if self.mode == "baseline":
            return np.full(len(X), self.models.get(asset, np.nan))
        m = self.models.get(asset)
        if m is None and self.mode == "fleet":
            m = self.models.get(ALL)
        if m is None:
            return np.full(len(X), np.nan)
        return m.predict(X[self.features])

    def predict(self, df: pd.DataFrame) -> pd.Series:
        """Expected value for each row; includes the turbine's static offset if enabled."""
        out = pd.Series(np.nan, index=df.index)
        for asset, idx in df.groupby("asset").groups.items():
            off = self.offsets.get(asset, 0.0) if self.use_offset else 0.0
            out.loc[idx] = self._predict_asset(df.loc[idx], asset) + off
        return out


def _fit_lgb(X: pd.DataFrame, y: pd.Series, params: dict) -> lgb.LGBMRegressor:
    m = lgb.LGBMRegressor(**params)
    m.fit(X, y)
    return m


def _robust_scale(resid: pd.Series) -> float:
    r = resid.dropna()
    if r.empty:
        return 1.0
    mad = 1.4826 * np.median(np.abs(r - np.median(r)))
    return float(mad) if mad > 0 else float(r.std() or 1.0)


def fit_predict(df: pd.DataFrame, train_mask: pd.Series, signal: str, features: list[str],
                mode: str, params: dict, n_folds: int = 4,
                asset_offset: bool = True) -> tuple[SignalModel, pd.Series]:
    """Fit the models for one signal and return predictions for every row of ``df``.

    ``train_mask`` marks healthy, normal-operation rows of the training period.
    Rows of the training period get out-of-sample predictions.

    With ``asset_offset`` each turbine's median training residual (its static offset
    from the model, e.g. sensor placement/calibration or a pre-existing condition) is
    added to its expected values, so the monitoring residual measures *change* since
    the training period. The offsets themselves are kept for fleet screening.
    """
    sm = SignalModel(signal=signal, mode=mode, features=features, use_offset=asset_offset)
    ok = train_mask & df[signal].notna()
    assets = df["asset"].unique()
    pred = pd.Series(np.nan, index=df.index)

    if mode == "baseline":
        means = df.loc[ok].groupby("asset")[signal].mean()
        sm.models = means.to_dict()
        pred = sm.predict(df)

    elif mode == "fleet":
        if len(assets) < 2:
            raise ValueError("fleet mode needs at least two assets; use mode 'self'")
        for a in assets:
            tr = ok & (df["asset"] != a)
            sm.models[a] = _fit_lgb(df.loc[tr, features], df.loc[tr, signal], params)
        sm.models[ALL] = _fit_lgb(df.loc[ok, features], df.loc[ok, signal], params)  # for new assets
        pred = sm.predict(df)

    elif mode == "self":
        month = df["timestamp"].dt.year * 12 + df["timestamp"].dt.month
        fold = month % n_folds
        for a in assets:
            mine = df["asset"] == a
            tr = ok & mine
            if tr.sum() < 100:
                continue
            sm.models[a] = _fit_lgb(df.loc[tr, features], df.loc[tr, signal], params)
            pred.loc[mine] = sm.models[a].predict(df.loc[mine, features])
            # out-of-fold predictions for the training rows
            for k in range(n_folds):
                fit_rows = tr & (fold != k)
                oof_rows = mine & train_mask.reindex(df.index, fill_value=False) & (fold == k)
                if fit_rows.sum() < 100 or oof_rows.sum() == 0:
                    continue
                mk = _fit_lgb(df.loc[fit_rows, features], df.loc[fit_rows, signal], params)
                pred.loc[oof_rows] = mk.predict(df.loc[oof_rows, features])
    else:
        raise ValueError(f"unknown mode {mode}")

    resid = (df[signal] - pred)[ok]
    sm.offsets = resid.groupby(df.loc[ok, "asset"]).median().to_dict()
    if asset_offset:
        pred = pred + df["asset"].map(sm.offsets).fillna(0.0)
        resid = (df[signal] - pred)[ok]
    sm.scale = _robust_scale(resid)
    return sm, pred
