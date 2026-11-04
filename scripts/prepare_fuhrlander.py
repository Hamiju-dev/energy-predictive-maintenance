"""Convert the raw Fuhrländer JSON files into the tool's standard input format.

This is the only Fuhrländer-specific code in the project. Everything downstream
(`python -m predmaint ...`) works on two standard tables, so any other wind farm
can be plugged in by writing a similar adapter (or by exporting the two tables
directly from a SCADA system):

1. SCADA table  data/processed/fuhrlander/scada.parquet
   one row per turbine and 10-minute timestamp:
   timestamp | turbine_id | power_kw | wind_speed | ... | <component temperatures>

2. Events table data/processed/fuhrlander/events.parquet
   one row per fault event:
   turbine_id | component | kind | start | end | n_alarms | description

Event definitions (from the turbine controller's alarm log):
* kind="thermal_alarm": the controller's own high-temperature alarms for a
  component (warning "> SH" and trip "> SHH" levels). Alarms of the same component
  less than `--merge-gap-days` apart are merged into one episode. These are what
  the existing SCADA system already catches; the goal is to see them coming earlier.
* kind="major_outage": the turbine produced < 10 % of the fleet median for at
  least `--outage-min-days` days while the rest of the fleet was producing
  (daily fleet median > 150 kW). These are the costly failures. The description
  lists the most frequent stopping alarms from 7 days before to 2 days after the outage start.

Usage:
    python scripts/prepare_fuhrlander.py
"""

from __future__ import annotations

import argparse
import bz2
import json
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT / "data" / "raw" / "fuhrlander"
OUT_DIR = REPO_ROOT / "data" / "processed" / "fuhrlander"
TURBINES = [80, 81, 82, 83, 84]

# Raw signal name -> readable standard name. Only 5-min averages are kept.
SIGNALS = {
    # operating conditions (model inputs)
    "wgdc_avg_TriGri_PwrAt": "power_kw",
    "wnac_avg_WSpd1": "wind_speed",
    "wgen_avg_Spd": "generator_speed_rpm",
    "wnac_avg_ExlTmp": "ambient_temp",
    "wnac_avg_NacTmp": "nacelle_temp",
    # gearbox
    "wtrm_avg_TrmTmp_Gbx": "gearbox_temp",
    "wtrm_avg_TrmTmp_GbxOil": "gearbox_oil_temp",
    "wtrm_avg_TrmTmp_GbxBrg151": "gearbox_bearing_151_temp",
    "wtrm_avg_TrmTmp_GbxBrg152": "gearbox_bearing_152_temp",
    "wtrm_avg_TrmTmp_GbxBrg450": "gearbox_bearing_450_temp",
    "wtrm_avg_TrmTmp_GbxBrg451": "gearbox_bearing_451_temp",
    "wtrm_avg_TrmTmp_GbxBrg452": "gearbox_bearing_452_temp",
    "wtrm_avg_TrmTmp_GbxClWtFrw": "gearbox_coolwater_fwd_temp",
    # main bearing
    "wtrm_avg_TrmTmp_Brg1": "main_bearing_1_temp",
    "wtrm_avg_TrmTmp_Brg2": "main_bearing_2_temp",
    # generator
    "wgen_avg_GnTmp_phsA": "generator_winding_a_temp",
    "wgen_avg_GnTmp_phsB": "generator_winding_b_temp",
    "wgen_avg_GnTmp_phsC": "generator_winding_c_temp",
    "wtrm_avg_TrmTmp_GnBrgDE": "generator_bearing_de_temp",
    "wtrm_avg_TrmTmp_GnBrgNDE": "generator_bearing_nde_temp",
    "wtrm_avg_TrmTmp_GnClWtBkw": "generator_coolwater_return_temp",
    # transformer and converter
    "wgdc_avg_GdcTmp_TrfGn": "transformer_temp",
    "wcnv_avg_HtSnkTmp": "converter_heatsink_temp",
    "wcnv_avg_InvTmp_ClWtrRet": "converter_coolwater_return_temp",
}

# High-temperature alarm codes per component (from the alarm dictionary).
COMPONENT_ALARMS = {
    "gearbox": [916, 1367, 1368, 1371, 1372, 1373, 1374, 1375, 1376, 1377,
                2300, 2301, 2302, 2303, 2304, 2305, 2306],
    "main_bearing": [1359, 1360, 1363, 1364, 1702],
    "generator": [531, 533, 535, 562, 2028, 2035, 2037, 2058, 2059, 2060, 2064, 2066],
    "transformer": [113, 114],
}


def load_turbine(t: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    with bz2.open(RAW_DIR / f"turbine_{t}.json.bz2") as f:
        j = json.load(f)
    a = pd.DataFrame(j["analog_data"])
    a = a[["date_time", *SIGNALS]].rename(columns=SIGNALS)
    a["timestamp"] = pd.to_datetime(a.pop("date_time"))
    a["turbine_id"] = t
    al = pd.DataFrame(j["alarms"])
    return a, al


def clean_scada(a: pd.DataFrame) -> pd.DataFrame:
    """Resample to 10 min and mark obviously invalid readings as missing."""
    temp_cols = [c for c in a.columns if c.endswith("_temp")]
    # The logger writes exact zeros when a sensor or the whole SCADA link drops out.
    for c in temp_cols:
        a.loc[a[c].abs() < 0.05, c] = np.nan
    a.loc[(a.wind_speed < 0) | (a.wind_speed > 40), "wind_speed"] = np.nan
    a.loc[(a.power_kw < -100) | (a.power_kw > 3000), "power_kw"] = np.nan
    out = (
        a.set_index("timestamp")
        .groupby("turbine_id")
        .resample("10min")
        .mean(numeric_only=True)
        .drop(columns="turbine_id", errors="ignore")
        .reset_index()
    )
    out = out.dropna(subset=["power_kw", "wind_speed"], how="all")
    return mask_scrambled_channels(out, temp_cols)


def mask_scrambled_channels(d: pd.DataFrame, temp_cols: list[str]) -> pd.DataFrame:
    """Blank temperatures on days where the channel mapping is physically impossible.

    On some days (T84: 21 Mar - 2 Apr 2012 and from 30 May 2014, right after a controller
    fault) the logger mixes up channels: the gearbox reads ~33 °C at full power while a
    gearbox bearing reads ~96 °C and the nacelle 74 °C. Such readings are not
    component behaviour, so the whole turbine-day (plus one day either side) is set to
    missing instead of being allowed to look like a fault.
    """
    bad = ((d.power_kw > 1000) & (d.gearbox_temp < 45)
           & (d.gearbox_bearing_152_temp > d.gearbox_temp + 20))
    day = d.timestamp.dt.floor("D")
    bad_days = set(day[bad])
    bad_days |= {x + pd.Timedelta(days=k) for x in bad_days for k in (-1, 1)}
    hit = day.isin(bad_days)
    if hit.any():
        print(f"  masked temperatures on {len(set(day[hit]))} turbine-days with scrambled channels")
    d.loc[hit, temp_cols] = np.nan
    return d


def clean_alarms(al: pd.DataFrame) -> pd.DataFrame:
    al = al.copy()
    al["start"] = pd.to_datetime(al.date_time_ini)
    al["end"] = pd.to_datetime(al.date_time_end, errors="coerce")
    # Data-quality fix: ~3,400 rows carry the year 2017 in the start time while the
    # end time (and the surrounding rows) are in 2014, so the year is a typo.
    bad = (al.start.dt.year == 2017) & (al.end.dt.year == 2014)
    al.loc[bad, "start"] = al.loc[bad, "start"] - pd.DateOffset(years=3)
    return al


def thermal_events(alarms: pd.DataFrame, merge_gap_days: float) -> pd.DataFrame:
    rows = []
    for comp, ids in COMPONENT_ALARMS.items():
        x = alarms[alarms.alarm_id.isin(ids)].sort_values(["turbine_id", "start"])
        for t, g in x.groupby("turbine_id"):
            new = g.start.diff() > pd.Timedelta(days=merge_gap_days)
            for _, ep in g.groupby(new.cumsum()):
                trips = ep.availability.eq(0).sum()
                rows.append({
                    "turbine_id": t, "component": comp, "kind": "thermal_alarm",
                    "start": ep.start.min(), "end": ep.end.max() if ep.end.notna().any() else ep.start.max(),
                    "n_alarms": len(ep),
                    "description": f"{len(ep)} alarms ({trips} trips): "
                                   + ", ".join(ep.alarm_desc.value_counts().index[:3]),
                })
    return pd.DataFrame(rows)


def outage_events(scada: pd.DataFrame, alarms: pd.DataFrame, min_days: int) -> pd.DataFrame:
    daily = scada.set_index("timestamp").groupby("turbine_id").power_kw.resample("1D").mean().unstack(0)
    fleet = daily.median(axis=1)
    down = daily.lt(0.1 * fleet, axis=0) & (fleet > 150).to_numpy()[:, None]
    rows = []
    for t in daily.columns:
        s = down[t]
        # bridge single non-down days so one windless day doesn't split an outage
        s = s | (s.shift(1, fill_value=False) & s.shift(-1, fill_value=False))
        run_id = (s != s.shift()).cumsum()
        for _, r in s.loc[s].groupby(run_id.loc[s]):
            if len(r) < min_days:
                continue
            start, end = r.index[0], r.index[-1] + pd.Timedelta(days=1)
            first = alarms[(alarms.turbine_id == t) & (alarms.start >= start - pd.Timedelta(days=7))
                           & (alarms.start < start + pd.Timedelta(days=2)) & (alarms.availability == 0)
                           & (alarms.alarm_desc.str.len() > 0)]
            rows.append({
                "turbine_id": t, "component": "turbine", "kind": "major_outage",
                "start": start, "end": end, "n_alarms": len(first),
                "description": f"{len(r)} days down; stop alarms: "
                               + ", ".join(first.alarm_desc.value_counts().index[:4]),
            })
    return pd.DataFrame(rows)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--merge-gap-days", type=float, default=14.0)
    p.add_argument("--outage-min-days", type=int, default=5)
    args = p.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scada_parts, alarm_parts = [], []
    for t in TURBINES:
        print(f"turbine {t}: loading")
        a, al = load_turbine(t)
        scada_parts.append(clean_scada(a))
        alarm_parts.append(al)
    scada = pd.concat(scada_parts, ignore_index=True)
    scada["turbine_id"] = scada.turbine_id.astype(int)
    alarms = clean_alarms(pd.concat(alarm_parts, ignore_index=True))

    events = pd.concat([thermal_events(alarms, args.merge_gap_days),
                        outage_events(scada, alarms, args.outage_min_days)], ignore_index=True)
    events = events.sort_values(["turbine_id", "start"]).reset_index(drop=True)

    scada.to_parquet(OUT_DIR / "scada.parquet", index=False)
    events.to_parquet(OUT_DIR / "events.parquet", index=False)
    alarms[["turbine_id", "alarm_id", "alarm_desc", "start", "end", "availability"]].to_parquet(
        OUT_DIR / "alarms.parquet", index=False)
    print(f"SCADA:  {len(scada):,} rows x {scada.shape[1]} cols, "
          f"{scada.timestamp.min():%Y-%m-%d} to {scada.timestamp.max():%Y-%m-%d}")
    print(f"Events: {len(events)}")
    print(events.groupby(["kind", "component"]).size().to_string())


if __name__ == "__main__":
    main()
