"""Load and validate pipeline configuration files (YAML)."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULTS: dict[str, Any] = {
    "data": {"timestamp_col": "timestamp", "asset_col": "turbine_id", "events_path": None},
    "roles": {},
    "normal_operation": {
        "min_power_frac": 0.02,
        "min_wind_speed": 3.0,
        "exclude_days_before_event": 7,
        "exclude_days_before_outage": 30,
        "exclude_days_after_event": 3,
    },
    "model": {"mode": "fleet", "lightgbm": {"n_estimators": 300, "learning_rate": 0.05, "verbose": -1}},
    "anomaly": {
        "min_samples_per_day": 36,
        "ewm_halflife_days": 3,
        "threshold_quantile": 0.99,
        "min_consecutive_days": 2,
        "aggregate": "mean",
        "common_mode": False,
    },
    "evaluation": {"warning_window_days": 30, "min_coverage": 0.5},
    "prediction": {"horizon_days": 14},
    "output_dir": None,
}

REQUIRED_ROLES = ("power", "wind_speed", "ambient_temp")


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def resolve_path(p: str | Path | None) -> Path | None:
    """Relative paths in configs are relative to the repository root."""
    if p is None:
        return None
    p = Path(p)
    return p if p.is_absolute() else REPO_ROOT / p


def validate(cfg: dict) -> dict:
    errors = []
    for key in ("name", "data", "components", "split", "rated_power_kw"):
        if key not in cfg:
            errors.append(f"missing top-level key '{key}'")
    if "data" in cfg and "scada_path" not in cfg["data"]:
        errors.append("data.scada_path is required")
    for role in REQUIRED_ROLES:
        if role not in cfg.get("roles", {}):
            errors.append(f"roles.{role} is required")
    for comp, spec in cfg.get("components", {}).items():
        if not spec.get("signals"):
            errors.append(f"components.{comp}.signals must list at least one column")
    if cfg.get("model", {}).get("mode") not in ("fleet", "self"):
        errors.append("model.mode must be 'fleet' or 'self'")
    for key in ("train_start", "train_end", "test_end"):
        if key not in cfg.get("split", {}):
            errors.append(f"split.{key} is required")
    if errors:
        raise ValueError("Invalid config:\n  - " + "\n  - ".join(errors))
    return cfg


def load_config(path: str | Path, overrides: dict | None = None) -> dict:
    with open(resolve_path(path)) as f:
        user = yaml.safe_load(f) or {}
    cfg = _merge(DEFAULTS, user)
    if overrides:
        cfg = _merge(cfg, overrides)
    if cfg.get("output_dir") is None:
        cfg["output_dir"] = f"outputs/{cfg.get('name', 'run')}"
    return validate(cfg)
