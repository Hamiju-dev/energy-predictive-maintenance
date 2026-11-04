"""How useful are the alarms? Early-warning lead time and false alarms.

* An event counts as **caught** if an alarm for its component (any component
  for whole-turbine outages) was active on at least one day of the warning
  window ``[start - W, start)``.
* **Lead time** = days between the first alarm day in that window and the
  event start (capped at W, since we only look W days back).
* Events whose window has too little SCADA data are reported as *not scorable*
  instead of being counted as misses.
* A **false alarm** is an alarm episode (consecutive alarm days, gaps of up to
  3 days bridged) that is not followed by an event of that component / turbine
  within W days and does not overlap one.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


EVENT_COLUMNS = ["asset", "component", "kind", "start", "description", "coverage", "scorable",
                 "caught", "lead_days", "max_score_in_window", "fleet_wide"]


def flag_fleet_wide(events: pd.DataFrame, days: int = 2) -> pd.Series:
    """True if another turbine had an event of the same component within +-``days``.

    Such events (e.g. every gearbox hitting its temperature limit on a hot day) are
    weather/design driven, not a developing fault of one turbine.
    """
    flags = []
    for e in events.itertuples():
        other = events[(events["asset"] != e.asset) & (events["component"] == e.component)]
        flags.append(bool(((other["start"] - e.start).abs() <= pd.Timedelta(days=days)).any()))
    return pd.Series(flags, index=events.index, dtype=bool)


def alarm_episodes(scores: pd.DataFrame, max_gap_days: int = 3) -> pd.DataFrame:
    rows = []
    for asset, g in scores[scores["alarm"]].groupby("asset"):
        dates = g["date"].sort_values()
        new = dates.diff().dt.days.fillna(np.inf) > max_gap_days + 1
        for _, ep in dates.groupby(new.cumsum()):
            rows.append({"asset": asset, "start": ep.iloc[0], "end": ep.iloc[-1], "days": len(ep)})
    return pd.DataFrame(rows, columns=["asset", "start", "end", "days"])


def score_events(events: pd.DataFrame, scores: pd.DataFrame, window_days: int,
                 min_coverage: float) -> pd.DataFrame:
    W = pd.Timedelta(days=window_days)
    rows = []
    for e in events.itertuples():
        start = e.start.floor("D")
        s = scores[(scores["asset"] == e.asset) & (scores["date"] >= start - W) & (scores["date"] < start)]
        coverage = len(s) / window_days
        first = s.loc[s["alarm"], "date"].min() if s["alarm"].any() else pd.NaT
        rows.append({
            "asset": e.asset, "component": e.component, "kind": e.kind, "start": e.start,
            "description": e.description, "coverage": round(coverage, 2),
            "scorable": coverage >= min_coverage,
            "caught": bool(s["alarm"].any()),
            "lead_days": (start - first).days if pd.notna(first) else np.nan,
            "max_score_in_window": s["score"].max() if len(s) else np.nan,
            "fleet_wide": bool(getattr(e, "fleet_wide", False)),
        })
    return pd.DataFrame(rows, columns=EVENT_COLUMNS)


def false_alarms(episodes: pd.DataFrame, events: pd.DataFrame, window_days: int,
                 after_days: int = 7) -> pd.DataFrame:
    W, A = pd.Timedelta(days=window_days), pd.Timedelta(days=after_days)
    flags = []
    for ep in episodes.itertuples():
        ev = events[events["asset"] == ep.asset]
        # true if the episode overlaps [event.start - W, event.end + A]
        related = ((ep.start <= ev["end"] + A) & (ep.end >= ev["start"] - W)).any()
        flags.append(not related)
    out = episodes.copy()
    out["false_alarm"] = flags
    return out


def summarise(scored: pd.DataFrame, episodes: pd.DataFrame, n_asset_days: int) -> dict:
    sc = scored.loc[scored["scorable"].astype(bool)]
    lead = sc.loc[sc["caught"], "lead_days"]
    fa = int(episodes["false_alarm"].sum()) if len(episodes) else 0
    years = n_asset_days / 365.25
    return {
        "events_scorable": int(len(sc)),
        "events_caught": int(sc["caught"].sum()),
        "detection_rate": round(float(sc["caught"].mean()), 3) if len(sc) else None,
        "median_lead_days": float(lead.median()) if len(lead) else None,
        "alarm_episodes": int(len(episodes)),
        "false_alarm_episodes": fa,
        "false_alarms_per_turbine_year": round(fa / years, 2) if years > 0 else None,
        "precision": round(1 - fa / len(episodes), 3) if len(episodes) else None,
    }
