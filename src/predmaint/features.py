"""Model inputs and the 'normal operation' filter."""

from __future__ import annotations

import numpy as np
import pandas as pd


def add_features(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Operating-condition features for the normal-behaviour models.

    Component temperatures lag the load (thermal inertia), so besides the current
    power we use its average over the last 1 h and 3 h.
    """
    df = df.sort_values(["asset", "timestamp"]).copy()
    df["power_frac"] = df["power"] / cfg["rated_power_kw"]
    roll = (
        df.set_index("timestamp")
        .groupby("asset")["power_frac"]
        .rolling("1h", min_periods=1).mean()
        .reset_index(level=0, drop=True)
    )
    df["power_frac_1h"] = roll.to_numpy()
    roll3 = (
        df.set_index("timestamp")
        .groupby("asset")["power_frac"]
        .rolling("3h", min_periods=1).mean()
        .reset_index(level=0, drop=True)
    )
    df["power_frac_3h"] = roll3.to_numpy()
    return df


def feature_columns(cfg: dict) -> list[str]:
    cols = ["power_frac", "power_frac_1h", "power_frac_3h", "wind_speed", "ambient_temp"]
    if "rotor_speed" in cfg["roles"]:
        cols.append("rotor_speed")
    return cols


def operating_mask(df: pd.DataFrame, cfg: dict) -> pd.Series:
    """Rows where the turbine is producing and the operating inputs are present."""
    no = cfg["normal_operation"]
    return (
        (df["power_frac"] > no["min_power_frac"])
        & (df["wind_speed"] > no["min_wind_speed"])
        & df["ambient_temp"].notna()
    )


def near_event_mask(df: pd.DataFrame, events: pd.DataFrame, cfg: dict,
                    component: str | None = None) -> pd.Series:
    """True for rows in the run-up to / aftermath of a known event.

    Used to keep fault periods out of the training data. When ``component`` is
    given, only events of that component and whole-turbine events count.
    """
    no = cfg["normal_operation"]
    before = pd.Timedelta(days=no["exclude_days_before_event"])
    after = pd.Timedelta(days=no["exclude_days_after_event"])
    mask = np.zeros(len(df), dtype=bool)
    if events.empty:
        return pd.Series(mask, index=df.index)
    ev = events if component is None else events[events.component.isin([component, "turbine"])]
    ts = df["timestamp"].to_numpy()
    asset = df["asset"].to_numpy()
    before_outage = pd.Timedelta(days=no.get("exclude_days_before_outage", no["exclude_days_before_event"]))
    for e in ev.itertuples():
        b = before_outage if e.kind == "major_outage" else before
        mask |= (asset == e.asset) & (ts >= np.datetime64(e.start - b)) & (ts <= np.datetime64(e.end + after))
    return pd.Series(mask, index=df.index)
