"""Shared fixtures: a small synthetic wind farm with one injected developing fault."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

FAULT_ASSET = "WT2"
FAULT_EVENT = pd.Timestamp("2021-09-15")
DRIFT_START = pd.Timestamp("2021-08-01")


def make_farm(seed: int = 0, n_assets: int = 4, freq: str = "1h") -> tuple[pd.DataFrame, pd.DataFrame]:
    """Two years of hourly SCADA for ``n_assets`` turbines.

    Gearbox temperature = f(load, ambient) + noise. From DRIFT_START, WT2's gearbox
    heats up gradually (+0.25 °C/day, as a degrading bearing would) until the event.
    """
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2020-01-01", "2022-01-01", freq=freq, inclusive="left")
    doy = ts.dayofyear.to_numpy()
    ambient = 10 + 9 * np.sin(2 * np.pi * (doy - 110) / 365) + rng.normal(0, 2, len(ts))
    frames = []
    for i in range(n_assets):
        wind = np.clip(rng.weibull(2.0, len(ts)) * 8, 0, 25)
        power = np.clip(2000 * ((wind - 3) / 9) ** 3, 0, 2000)
        power[wind < 3] = 0
        load = power / 2000
        load_smooth = pd.Series(load).rolling(3, min_periods=1).mean().to_numpy()
        gbx = 35 + 25 * load_smooth + 0.6 * ambient + rng.normal(0, 0.8, len(ts))
        name = f"WT{i + 1}"
        if name == FAULT_ASSET:
            days = (ts - DRIFT_START).total_seconds().to_numpy() / 86400
            gbx = gbx + np.where((days > 0) & (ts < FAULT_EVENT), 0.25 * days, 0)
        frames.append(pd.DataFrame({
            "time": ts, "turbine": name, "P_kW": power, "WS": wind, "T_amb": ambient,
            "T_gbx": gbx, "T_gbx_oil": gbx - 5 + rng.normal(0, 0.5, len(ts)),
        }))
    scada = pd.concat(frames, ignore_index=True)
    events = pd.DataFrame({"turbine": [FAULT_ASSET], "component": ["gearbox"], "kind": ["thermal_alarm"],
                           "start": [FAULT_EVENT], "end": [FAULT_EVENT + pd.Timedelta(days=1)],
                           "description": ["injected gearbox overheating"]})
    return scada, events


def farm_config(tmp_path) -> dict:
    return {
        "name": "synthetic",
        "data": {"scada_path": str(tmp_path / "scada.parquet"), "events_path": str(tmp_path / "events.parquet"),
                 "timestamp_col": "time", "asset_col": "turbine"},
        "roles": {"power": "P_kW", "wind_speed": "WS", "ambient_temp": "T_amb"},
        "rated_power_kw": 2000,
        "components": {"gearbox": {"signals": ["T_gbx", "T_gbx_oil"]}},
        "split": {"train_start": "2020-01-01", "train_end": "2021-01-01", "test_end": "2022-01-01"},
        "model": {"mode": "fleet", "lightgbm": {"n_estimators": 60, "learning_rate": 0.1, "verbose": -1}},
        "anomaly": {"min_samples_per_day": 4},
        "output_dir": str(tmp_path / "out"),
    }


@pytest.fixture
def farm(tmp_path):
    import yaml

    scada, events = make_farm()
    cfg = farm_config(tmp_path)
    scada.to_parquet(cfg["data"]["scada_path"])
    events.to_parquet(cfg["data"]["events_path"])
    path = tmp_path / "cfg.yaml"
    path.write_text(yaml.safe_dump(cfg))
    return path, scada, events
