"""Read the two standard input tables (SCADA + optional events) into a common shape.

After loading, the SCADA frame always has the columns
``timestamp``, ``asset``, the role columns (``power``, ``wind_speed``,
``ambient_temp`` and optionally ``rotor_speed``) and every monitored signal.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import resolve_path


def _read_table(path: Path) -> pd.DataFrame:
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    if path.suffix in (".csv", ".txt"):
        return pd.read_csv(path, sep=None, engine="python")
    raise ValueError(f"Unsupported file type: {path}")


def monitored_signals(cfg: dict) -> list[str]:
    seen: list[str] = []
    for spec in cfg["components"].values():
        seen += [s for s in spec["signals"] if s not in seen]
    return seen


def standardise_scada(raw: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    d = cfg["data"]
    ren = {d["timestamp_col"]: "timestamp", d["asset_col"]: "asset"}
    ren.update({col: role for role, col in cfg["roles"].items()})
    missing = [c for c in [*ren, *monitored_signals(cfg)] if c not in raw.columns]
    if missing:
        raise KeyError(f"SCADA table is missing columns: {missing}")
    df = raw.rename(columns=ren)
    keep = ["timestamp", "asset", *cfg["roles"].keys(), *monitored_signals(cfg)]
    df = df[list(dict.fromkeys(keep))].copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(["asset", "timestamp"]).drop_duplicates(["asset", "timestamp"])
    return df.reset_index(drop=True)


def load_scada(cfg: dict) -> pd.DataFrame:
    return standardise_scada(_read_table(resolve_path(cfg["data"]["scada_path"])), cfg)


def load_events(cfg: dict) -> pd.DataFrame:
    """Events need: asset column, component, start. Optional: end, kind, description."""
    path = cfg["data"].get("events_path")
    cols = ["asset", "component", "kind", "start", "end", "description"]
    if not path or not resolve_path(path).exists():
        return pd.DataFrame(columns=cols)
    ev = _read_table(resolve_path(path)).rename(columns={cfg["data"]["asset_col"]: "asset"})
    ev["start"] = pd.to_datetime(ev["start"])
    ev["end"] = pd.to_datetime(ev["end"]) if "end" in ev else ev["start"]
    ev["end"] = ev["end"].fillna(ev["start"])
    if "kind" not in ev:
        ev["kind"] = "event"
    if "description" not in ev:
        ev["description"] = ""
    return ev[cols].sort_values(["asset", "start"]).reset_index(drop=True)
