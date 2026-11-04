"""Export pipeline results as small JSON files for the dashboard (dashboard/src/data/, git-ignored).

Run after `python -m predmaint run --config configs/fuhrlander.yaml`:
    python scripts/export_dashboard_data.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))

from predmaint import evaluation, pipeline  # noqa: E402
from predmaint.config import load_config  # noqa: E402
from predmaint.data import load_events  # noqa: E402

OUT = REPO / "dashboard" / "src" / "data"
MODES = [("fleet", "Fleet model"), ("self", "Self model"), ("baseline", "No model")]


def nice(component: str) -> str:
    return component.replace("_", " ")


def main(config: str = "configs/fuhrlander.yaml") -> None:
    cfg = load_config(config)
    OUT.mkdir(parents=True, exist_ok=True)
    out_dir = pipeline.output_dir(cfg)

    # daily health score (fleet model) relative to the alarm level
    sc = pd.read_parquet(out_dir / "scores_fleet.parquet")
    health = pd.DataFrame({
        "turbine": "T" + sc["asset"].astype(str),
        "date": sc["date"].dt.strftime("%Y-%m-%d"),
        "component": sc["component"].map(nice),
        "score": (sc["score"] / sc["threshold"]).round(2),
        "alarm": sc["alarm"].astype(int),
    })

    # events, with the fleet model's evaluation for test-period events
    ev = load_events(cfg)
    ev = ev.assign(fleet_wide=evaluation.flag_fleet_wide(ev))
    scored = pd.read_parquet(out_dir / "events_scored_fleet.parquet")
    ev = ev.merge(scored[["asset", "component", "start", "scorable", "caught", "lead_days"]],
                  on=["asset", "component", "start"], how="left").sort_values("start").reset_index(drop=True)
    scorable = ev["scorable"].astype("boolean").fillna(False).astype(bool)
    caught = ev["caught"].astype("boolean").fillna(False).astype(bool)
    train = ev["start"] < pd.Timestamp(cfg["split"]["train_end"])
    warned = np.where(train, "Training period", np.where(scorable, np.where(caught, "Warned", "Missed"), "Not scorable"))
    events = pd.DataFrame({
        "id": [f"E{i + 1:02d}" for i in range(len(ev))],
        "turbine": "T" + ev["asset"].astype(str),
        "component": ev["component"].map(lambda c: "whole turbine" if c == "turbine" else nice(c)),
        "kind": ev["kind"].map({"thermal_alarm": "Temperature alarm", "major_outage": "Major outage"}),
        "start": ev["start"].dt.strftime("%Y-%m-%d"),
        "end": ev["end"].dt.strftime("%Y-%m-%d"),
        "scope": np.where(ev["fleet_wide"], "Fleet-wide", "Turbine-specific"),
        "warned": warned,
        "lead_days": ev["lead_days"].where(caught & ~train),
        "description": ev["description"],
    })

    s = pd.read_parquet(out_dir / "screening_fleet.parquet")
    s = s.groupby(["component", "asset"])["offset_c"].mean().reset_index()
    screening = pd.DataFrame({"component": s["component"].map(nice), "turbine": "T" + s["asset"].astype(str),
                              "offset_c": s["offset_c"].round(1)})

    metrics = json.loads((REPO / "reports" / f"metrics_{cfg['name']}.json").read_text())
    summary = []
    for mode, label in MODES:
        m = metrics[mode]
        o, ts = m["turbine (any component) vs major outages"], m["turbine-specific thermal alarms"]
        summary.append({
            "mode": mode, "method": label,
            "outages_warned": o["events_caught"], "outages_scorable": o["events_scorable"],
            "outage_lead_days": o["median_lead_days"],
            "temp_alarms_warned": ts["events_caught"], "temp_alarms_scorable": ts["events_scorable"],
            "temp_lead_days": ts["median_lead_days"],
            "false_alarms_per_turbine_year": round(o["false_alarms_per_turbine_year"], 1),
        })

    events_all = load_events(cfg)
    curve = []
    for mode, label in MODES:
        cv = pipeline.operating_curve(cfg, pd.read_parquet(out_dir / f"scores_{mode}.parquet"), events_all)
        for r in cv.itertuples():
            curve.append({"mode": mode, "method": label, "quantile": r.quantile,
                          "false_alarms_per_turbine_year": round(r.false_alarms_per_turbine_year, 2),
                          "outage_share": round(r.outages_caught / max(r.outages_scorable, 1), 3),
                          "temp_alarm_share": round(r.thermal_caught / max(r.thermal_scorable, 1), 3)})

    tables = {"health": health, "events": events, "screening": screening}
    for name, df in tables.items():
        (OUT / f"{name}.json").write_text(df.to_json(orient="records"))
    (OUT / "summary.json").write_text(json.dumps(summary))
    (OUT / "curve.json").write_text(json.dumps(curve))
    for p in sorted(OUT.glob("*.json")):
        print(f"  {p.relative_to(REPO)}  {p.stat().st_size / 1024:,.0f} KB")


if __name__ == "__main__":
    main(*sys.argv[1:])
