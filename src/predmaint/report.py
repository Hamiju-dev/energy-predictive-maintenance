"""Figures (reports/figures/) and a markdown results summary (reports/results_<name>.md)."""

from __future__ import annotations

import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from . import pipeline  # noqa: E402
from .config import resolve_path  # noqa: E402
from .features import operating_mask  # noqa: E402

# Palette: validated categorical slots in fixed order + neutral inks.
C = {
    "s1": "#2a78d6", "s2": "#eb6834", "s3": "#1baf7a", "s4": "#eda100", "s5": "#e87ba4",
    "ink": "#0b0b0b", "ink2": "#52514e", "muted": "#898781", "grid": "#e1e0d9",
    "axis": "#c3c2b7", "surface": "#fcfcfb", "critical": "#d03b3b", "neutral": "#b5b3ab",
}
MODE_COLOR = {"fleet": C["s1"], "self": C["s2"], "baseline": C["s3"]}
MODE_LABEL = {"fleet": "Fleet model (vs. sister turbines)", "self": "Self model (vs. own history)",
              "baseline": "No model (raw temperature)"}
COMP_COLOR = {"gearbox": C["s1"], "main_bearing": C["s2"], "generator": C["s3"],
              "transformer": C["s4"], "converter": C["s5"]}


def style() -> None:
    plt.rcParams.update({
        "figure.facecolor": C["surface"], "axes.facecolor": C["surface"], "savefig.facecolor": C["surface"],
        "font.family": "sans-serif", "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "bold",
        "axes.titlelocation": "left", "axes.titlepad": 20, "axes.labelcolor": C["ink2"], "text.color": C["ink"],
        "xtick.color": C["muted"], "ytick.color": C["muted"], "axes.edgecolor": C["axis"],
        "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
        "grid.color": C["grid"], "grid.linewidth": 0.6, "axes.axisbelow": True,
        "lines.linewidth": 2, "legend.frameon": False, "figure.dpi": 110, "savefig.dpi": 150,
        "savefig.bbox": "tight",
    })


def _save(fig, name: str) -> None:
    out = resolve_path("reports/figures")
    out.mkdir(parents=True, exist_ok=True)
    fig.savefig(out / name)
    plt.close(fig)


def _subtitle(ax, text: str) -> None:
    ax.text(0, 1.02, text, transform=ax.transAxes, color=C["ink2"], fontsize=9, va="bottom")


# ----------------------------------------------------------------------------- EDA
def fig_data_overview(df: pd.DataFrame, events: pd.DataFrame) -> None:
    assets = sorted(df["asset"].unique())
    fig, ax = plt.subplots(figsize=(11, 3.8))
    daily = df.groupby(["asset", df["timestamp"].dt.floor("D")]).size().reset_index(name="n")
    for i, a in enumerate(assets):
        d = daily[daily["asset"] == a]["timestamp"]
        ax.scatter(d, np.full(len(d), i), marker="|", s=60, color=C["neutral"], linewidths=1, zorder=1)
        for e in events[(events["asset"] == a) & (events["kind"] == "major_outage")].itertuples():
            ax.plot([e.start, e.end], [i - 0.28, i - 0.28], color=C["critical"], lw=4, solid_capstyle="round")
        th = events[(events["asset"] == a) & (events["kind"] != "major_outage")]
        for comp, g in th.groupby("component"):
            ax.scatter(g["start"], np.full(len(g), i + 0.25), s=36, color=COMP_COLOR.get(comp, C["muted"]),
                       edgecolor=C["surface"], linewidth=1, zorder=3)
    ax.set_yticks(range(len(assets)), [f"T{a}" for a in assets])
    ax.set_ylim(-0.7, len(assets) - 0.4)
    ax.grid(axis="y", visible=False)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    handles = [plt.Line2D([], [], color=C["neutral"], marker="|", ls="", ms=10, label="SCADA data available"),
               plt.Line2D([], [], color=C["critical"], lw=4, label="Major outage (≥ 5 days down)")]
    handles += [plt.Line2D([], [], color=c, marker="o", ls="", ms=6, label=f"{k.replace('_', ' ')} temp. alarm")
                for k, c in COMP_COLOR.items() if k in set(events["component"])]
    ax.legend(handles=handles, loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=4, fontsize=9)
    ax.set_title("Five turbines, three years: data coverage and fault events")
    _subtitle(ax, "Gap Jun–Nov 2013 = no SCADA data in the source. Training period: 2012. Test: 2013–2014.")
    _save(fig, "01_data_overview.png")


def fig_power_curve(df: pd.DataFrame, cfg: dict) -> None:
    op = operating_mask(df, cfg)
    s = df.sample(min(len(df), 120_000), random_state=0)
    ops = op.loc[s.index]
    fig, ax = plt.subplots(figsize=(6.5, 4.2))
    ax.scatter(s.loc[~ops, "wind_speed"], s.loc[~ops, "power"], s=2, color=C["neutral"], alpha=0.4,
               label="Excluded (stopped, idling, missing data)", rasterized=True)
    ax.scatter(s.loc[ops, "wind_speed"], s.loc[ops, "power"], s=2, color=C["s1"], alpha=0.25,
               label="Normal operation (used for modelling)", rasterized=True)
    ax.set_xlim(0, 25)
    ax.set_xlabel("Wind speed (m/s)")
    ax.set_ylabel("Active power (kW)")
    ax.set_title("Power curve: cleaning keeps only normal operation")
    lg = ax.legend(loc="lower right", markerscale=6, fontsize=9)
    for h in lg.legend_handles:
        h.set_alpha(1)
    _save(fig, "02_power_curve.png")


def fig_temp_vs_load(df: pd.DataFrame, cfg: dict, signal: str, highlight, title: str, fname: str) -> None:
    sp = cfg["split"]
    op = operating_mask(df, cfg)
    m = op & (df["timestamp"] >= sp["train_start"]) & (df["timestamp"] < sp["train_end"])
    d = df.loc[m, ["asset", "power", "ambient_temp", signal]].dropna()
    d["bin"] = (d["power"] // 100) * 100 + 50
    med = d.groupby(["asset", "bin"])[signal].median().reset_index()
    fig, ax = plt.subplots(figsize=(6.5, 4.2))
    ends = []
    for a, g in med.groupby("asset"):
        hi = a == highlight
        ax.plot(g["bin"], g[signal], color=C["s2"] if hi else C["neutral"], lw=2.4 if hi else 1.5,
                zorder=3 if hi else 2)
        ends.append([a, g["bin"].iloc[-1], g[signal].iloc[-1]])
    # direct labels at the line ends, nudged apart so they don't collide
    ends.sort(key=lambda e: e[2])
    span = med[signal].max() - med[signal].min()
    for i in range(1, len(ends)):
        ends[i][2] = max(ends[i][2], ends[i - 1][2] + 0.045 * span)
    for a, x, y in ends:
        hi = a == highlight
        ax.text(x + 40, y, f"T{a}", color=C["ink"] if hi else C["ink2"], fontsize=9, va="center",
                fontweight="bold" if hi else "normal")
    ax.set_xlabel("Active power (kW, 100 kW bins)")
    ax.set_ylabel(f"{signal.replace('_', ' ')} (°C, median)")
    ax.set_title(title)
    _subtitle(ax, "Training year 2012, normal operation only")
    _save(fig, fname)


# ----------------------------------------------------------------------------- NBM
def fig_nbm_example(df: pd.DataFrame, preds: pd.DataFrame, signal: str, assets, start: str, days: int,
                    fname: str) -> None:
    t0 = pd.Timestamp(start)
    fig, axes = plt.subplots(len(assets), 1, figsize=(11, 2.6 * len(assets)), sharex=True)
    axes = np.atleast_1d(axes)
    for ax, a in zip(axes, assets):
        m = (df["asset"] == a) & (df["timestamp"] >= t0) & (df["timestamp"] < t0 + pd.Timedelta(days=days))
        ax.plot(df.loc[m, "timestamp"], df.loc[m, signal], color=C["ink2"], lw=1.4, label="Measured")
        ax.plot(preds.loc[m, "timestamp"], preds.loc[m, signal], color=C["s1"], lw=1.6, label="Expected (model)")
        ax.set_ylabel("°C")
        ax.set_title(f"T{a}", fontsize=10)
    axes[0].legend(loc="upper right", ncol=2, fontsize=9)
    axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    fig.suptitle(f"Normal-behaviour model: measured vs expected {signal.replace('_', ' ')}",
                 x=0.06, ha="left", fontweight="bold")
    fig.tight_layout()
    _save(fig, fname)


def fig_nbm_accuracy(metrics: dict[str, pd.DataFrame]) -> None:
    modes = [m for m in ("fleet", "self") if m in metrics]
    base = metrics[modes[0]].sort_values(["component", "signal"])
    sig = base["signal"].tolist()
    y = np.arange(len(sig))
    h = 0.38
    fig, ax = plt.subplots(figsize=(7.5, 6))
    for i, m in enumerate(modes):
        v = metrics[m].set_index("signal").loc[sig, "mae"]
        ax.barh(y + (i - 0.5) * h, v, height=h - 0.04, color=MODE_COLOR[m], label=MODE_LABEL[m])
    ax.set_yticks(y, [s.replace("_temp", "").replace("_", " ") for s in sig], fontsize=8.5)
    ax.invert_yaxis()
    ax.set_xlabel("Mean absolute error on healthy test data (°C)")
    ax.set_title("Model accuracy per temperature signal")
    ax.grid(axis="y", visible=False)
    ax.legend(loc="lower right", fontsize=9)
    _save(fig, "05_nbm_accuracy.png")


# ----------------------------------------------------------------------------- anomaly
def fig_health(scores: dict[str, pd.DataFrame], events: pd.DataFrame, asset, component: str,
               title: str, fname: str, start=None, end=None) -> None:
    fig, (ax, rug) = plt.subplots(2, 1, figsize=(11, 4.6), sharex=True,
                                  gridspec_kw={"height_ratios": [6, 1], "hspace": 0.08})
    for k, (mode, sc) in enumerate(scores.items()):
        if component == "any":
            s = pipeline.any_component(sc)
            s = s[s["asset"] == asset].sort_values("date")
            y, thr = s["score"], 1.0
        else:
            s = sc[(sc["asset"] == asset) & (sc["component"] == component)].sort_values("date")
            y, thr = s["score"] / s["threshold"], 1.0
        if start is not None:
            keep = (s["date"] >= start) & (s["date"] <= end)
            s, y = s[keep], y[keep]
        # break the line at data gaps
        gap = s["date"].diff().dt.days.fillna(1) > 3
        yy = y.copy().astype(float)
        yy[gap.to_numpy()] = np.nan
        ax.plot(s["date"], yy, color=MODE_COLOR[mode], lw=1.8, label=MODE_LABEL[mode])
        al = s["alarm"].to_numpy()
        rug.scatter(s["date"][al], np.full(al.sum(), k), marker="|", s=50, linewidths=1.5,
                    color=MODE_COLOR[mode])
    ax.axhline(thr, color=C["ink2"], lw=1, ls="--")
    ax.text(1.0, thr, " alarm\n threshold", transform=ax.get_yaxis_transform(), color=C["ink2"],
            fontsize=8.5, va="center")
    ev = events[events["asset"] == asset]
    if component != "any":
        ev = ev[ev["component"].isin([component])]
    if start is not None:
        ev = ev[(ev["start"] >= start) & (ev["start"] <= end)]
    for e in ev.itertuples():
        col = C["critical"]
        if e.kind == "major_outage":
            ax.axvspan(e.start, e.end, color=col, alpha=0.12, lw=0)
        ax.axvline(e.start, color=col, lw=1.2)
    handles, labels = ax.get_legend_handles_labels()
    handles.append(plt.Line2D([], [], color=C["critical"], lw=1.2))
    labels.append("Fault event start (SCADA alarm / outage)")
    ax.legend(handles, labels, loc="upper left", fontsize=9, ncol=2)
    ax.set_ylabel("Health score ÷ threshold")
    rug.set_yticks(range(len(scores)), [f"{m} alarm" for m in scores], fontsize=8)
    rug.set_ylim(-0.7, len(scores) - 0.3)
    rug.invert_yaxis()
    rug.grid(axis="y", visible=False)
    rug.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    ax.set_title(title)
    _subtitle(ax, "Score > 1 for 2+ days in a row = alarm (bottom strip). Blank stretches = no SCADA data.")
    _save(fig, fname)


def fig_lead_times(tables: dict[str, pd.DataFrame], window: int) -> None:
    modes = list(tables)
    base = tables[modes[0]]
    base = base[base["scorable"].astype(bool)].sort_values(["kind", "start"]).reset_index(drop=True)
    labels = [f"T{r.asset} {('outage' if r.kind == 'major_outage' else r.component.replace('_', ' '))} "
              f"{r.start:%b %Y}" for r in base.itertuples()]
    y = np.arange(len(base))
    h = 0.8 / len(modes)
    fig, ax = plt.subplots(figsize=(8, 0.42 * len(base) + 1.6))
    for i, m in enumerate(modes):
        t = tables[m].set_index(["asset", "component", "start"])
        lead = [t.loc[(r.asset, r.component, r.start), "lead_days"] for r in base.itertuples()]
        lead = np.nan_to_num(np.array(lead, dtype=float), nan=0)
        ax.barh(y + (i - (len(modes) - 1) / 2) * h, lead, height=h - 0.03, color=MODE_COLOR[m],
                label=MODE_LABEL[m])
    ax.set_yticks(y, labels, fontsize=8.5)
    ax.invert_yaxis()
    ax.set_xlim(0, window + 1)
    ax.set_xlabel(f"Days of early warning before the event (0 = missed; capped at {window})")
    ax.set_title("Early warning per fault event (test period 2013–2014)")
    ax.grid(axis="y", visible=False)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12 - 1.2 / (0.42 * len(base) + 1.6)), ncol=3, fontsize=8.5)
    _save(fig, "08_lead_times.png")


def fig_operating_curve(curves: dict[str, pd.DataFrame]) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharey=False)
    for m, cv in curves.items():
        x = cv["false_alarms_per_turbine_year"]
        axes[0].plot(x, cv["outages_caught"] / cv["outages_scorable"].clip(lower=1), color=MODE_COLOR[m],
                     marker="o", ms=5, label=MODE_LABEL[m])
        axes[1].plot(x, cv["thermal_caught"] / cv["thermal_scorable"].clip(lower=1), color=MODE_COLOR[m],
                     marker="o", ms=5, label=MODE_LABEL[m])
    for ax, t in zip(axes, ["Major outages warned ≤ 30 days ahead", "Temperature alarms warned ≤ 30 days ahead"]):
        ax.set_xlabel("False-alarm episodes per turbine-year")
        ax.set_ylabel("Share of events caught")
        ax.set_ylim(-0.03, 1.05)
        ax.set_title(t, fontsize=11)
    axes[0].legend(loc="lower right", fontsize=8.5)
    fig.suptitle("Trade-off: sensitivity vs false alarms (each dot = one alarm threshold)",
                 x=0.06, ha="left", fontweight="bold")
    fig.tight_layout()
    _save(fig, "09_operating_curve.png")


def fig_screening(screen: pd.DataFrame) -> None:
    """Fleet screening: how much hotter/colder each turbine runs than its sister turbines."""
    from matplotlib.colors import LinearSegmentedColormap
    t = screen.groupby(["component", "asset"])["offset_c"].mean().unstack("asset")
    t = t.loc[[c for c in COMP_COLOR if c in t.index]]
    cmap = LinearSegmentedColormap.from_list("div", ["#2a78d6", "#f0efec", "#e34948"])
    lim = max(3.0, float(np.nanmax(np.abs(t.to_numpy()))))
    fig, ax = plt.subplots(figsize=(7, 3.6))
    ax.imshow(t.to_numpy(), cmap=cmap, vmin=-lim, vmax=lim, aspect="auto")
    for i in range(t.shape[0]):
        for j in range(t.shape[1]):
            v = t.iat[i, j]
            ax.text(j, i, f"{v:+.1f}", ha="center", va="center", fontsize=10,
                    color=C["ink"], fontweight="bold" if abs(v) >= 2 else "normal")
    ax.set_xticks(range(t.shape[1]), [f"T{a}" for a in t.columns])
    ax.set_yticks(range(t.shape[0]), [c.replace("_", " ") for c in t.index])
    ax.grid(False)
    for sp_ in ax.spines.values():
        sp_.set_visible(False)
    ax.set_title("Fleet screening: °C hotter (+) or cooler (−) than sister turbines")
    _subtitle(ax, "Median model residual in the 2012 training year, averaged over each component's sensors")
    _save(fig, "12_fleet_screening.png")


# ----------------------------------------------------------------------------- markdown
def _md_table(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for r in df.itertuples(index=False):
        lines.append("| " + " | ".join("" if (isinstance(v, float) and np.isnan(v)) else str(v) for v in r) + " |")
    return "\n".join(lines)


def write_results_md(cfg: dict, summaries: dict, tables: dict, metrics: dict, curves: dict) -> None:
    out = [f"# Results: {cfg['name']}", "",
           "Generated by `python -m predmaint run`. Test period "
           f"{cfg['split']['train_end']} to {cfg['split']['test_end']}; models trained on "
           f"{cfg['split']['train_start']} to {cfg['split']['train_end']}.", ""]
    out += ["## Summary per mode", ""]
    rows = []
    for m, s in summaries.items():
        t = s["turbine (any component) vs major outages"]
        th = s["all thermal-alarm events"]
        rows.append({"mode": m,
                     "outages caught": f"{t['events_caught']}/{t['events_scorable']}",
                     "median lead (outages, days)": t["median_lead_days"],
                     "temp. alarms caught": f"{th['events_caught']}/{th['events_scorable']}",
                     "median lead (temp. alarms, days)": th["median_lead_days"],
                     "false alarms / turbine-year": t["false_alarms_per_turbine_year"],
                     "alarm precision": t["precision"]})
    out += [_md_table(pd.DataFrame(rows)), ""]
    out += ["## Per component", ""]
    for m, s in summaries.items():
        comp = pd.DataFrame([{"component": k, **v} for k, v in s.items()
                             if k in cfg["components"]])
        out += [f"### {m}", "", _md_table(comp), ""]
    out += ["## Normal-behaviour model accuracy (healthy test data)", ""]
    for m, df in metrics.items():
        out += [f"### {m}", "", _md_table(df.round(3)), ""]
    out += ["## Events (scorable = enough SCADA data in the 30-day window)", ""]
    for m, t in tables.items():
        tt = t.copy()
        tt["start"] = pd.to_datetime(tt["start"]).dt.strftime("%Y-%m-%d")
        out += [f"### {m}", "", _md_table(tt.drop(columns=["max_score_in_window"]).round(2)), ""]
    out += ["## Operating curve (threshold quantile → result)", ""]
    for m, cv in curves.items():
        out += [f"### {m}", "", _md_table(cv.round(2)), ""]
    p = resolve_path("reports") / f"results_{cfg['name']}.md"
    p.write_text("\n".join(out))


# ----------------------------------------------------------------------------- entry
def build(cfg: dict, df: pd.DataFrame, events: pd.DataFrame, modes: list[str]) -> None:
    style()
    print("Building figures ...")
    fig_data_overview(df, events)
    fig_power_curve(df, cfg)
    fig_temp_vs_load(df, cfg, "gearbox_bearing_450_temp", 81,
                     "T81's gearbox runs hotter than its sister turbines at the same load",
                     "03_gearbox_temp_vs_load.png")
    runs = {m: pipeline.load_run(cfg, m) for m in modes}
    tables, summaries, curves = {}, {}, {}
    for m in modes:
        tables[m], summaries[m] = pipeline.evaluate(cfg, runs[m]["scores"], events)
        curves[m] = pipeline.operating_curve(cfg, runs[m]["scores"], events)
    model_modes = [m for m in modes if m != "baseline"]
    if model_modes:
        m0 = model_modes[0]
        fig_nbm_example(df, runs[m0]["predictions"], "gearbox_temp", [82, 81], "2014-05-26", 10,
                        "04_nbm_example.png")
        fig_nbm_accuracy({m: runs[m]["nbm_metrics"] for m in model_modes})
    if "fleet" in runs:
        fig_screening(runs["fleet"]["screening"])
    scores = {m: runs[m]["scores"] for m in modes}
    fig_health(scores, events, 81, "gearbox", "T81 gearbox: health score vs. its summer overheating alarms",
               "06_health_t81_gearbox.png")
    fig_health(scores, events, 84, "any", "T84 whole turbine: health score before its 107-day outage",
               "07_health_t84_outage.png", start=pd.Timestamp("2014-01-01"), end=pd.Timestamp("2014-10-01"))
    fig_lead_times(tables, cfg["evaluation"]["warning_window_days"])
    fig_operating_curve(curves)
    write_results_md(cfg, summaries, tables, {m: runs[m]["nbm_metrics"] for m in model_modes}, curves)
    pipeline.write_json(summaries, resolve_path("reports") / f"metrics_{cfg['name']}.json")
    print("  figures in reports/figures/, summary in reports/")


def build_from_saved(config_path: str, modes: list[str]) -> None:
    from .config import load_config
    from .data import load_events
    cfg = load_config(config_path)
    build(cfg, pipeline.prepare(cfg), load_events(cfg), modes)


if __name__ == "__main__":  # python -m predmaint.report configs/x.yaml fleet self baseline
    import sys
    build_from_saved(sys.argv[1], sys.argv[2:] or ["fleet", "self", "baseline"])
    print(json.dumps({"ok": True}))
