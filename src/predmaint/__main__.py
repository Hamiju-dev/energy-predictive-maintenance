"""Command-line interface.

    python -m predmaint run   --config configs/fuhrlander.yaml [--modes fleet self baseline]
    python -m predmaint score --config configs/fuhrlander.yaml --input new_scada.parquet --out alarms.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from . import pipeline, report
from .config import load_config, resolve_path
from .data import load_events


def cmd_run(args) -> int:
    cfg = load_config(args.config)
    print(f"Loading data for '{cfg['name']}' ...")
    df = pipeline.prepare(cfg)
    events = load_events(cfg)
    print(f"  {len(df):,} rows, {df['asset'].nunique()} assets, {len(events)} events")
    summaries = {}
    for mode in args.modes:
        print(f"Fitting normal-behaviour models ({mode}) ...")
        cfg_mode = {**cfg, "model": {**cfg["model"], "mode": mode}}
        res = pipeline.fit_and_score(cfg_mode, df, events, mode)
        pipeline.save_run(cfg, res)
        table, summary = pipeline.evaluate(cfg, res.scores, events)
        table.to_parquet(pipeline.output_dir(cfg) / f"events_scored_{mode}.parquet", index=False)
        summaries[mode] = summary
        print(f"  NBM median MAE: {res.nbm_metrics['mae'].median():.2f} °C, "
              f"median R²: {res.nbm_metrics['r2'].median():.3f}")
    pipeline.write_json(summaries, resolve_path("reports") / f"metrics_{cfg['name']}.json")
    if not args.no_report:
        report.build(cfg, df, events, args.modes)
    return 0


def cmd_score(args) -> int:
    cfg = load_config(args.config)
    bundle = pipeline.Bundle.load(resolve_path("models") / cfg["name"] / f"bundle_{args.mode}.joblib")
    path = Path(args.input)
    scada = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path, sep=None, engine="python")
    scores = pipeline.score_new_data(bundle, scada)
    scores.to_csv(args.out, index=False)
    active = scores[scores["alarm"]].groupby(["asset", "component"])["date"].agg(["min", "max", "count"])
    print(f"Wrote {len(scores):,} daily scores to {args.out}")
    print("Alarms:" if len(active) else "No alarms.")
    if len(active):
        print(active.rename(columns={"min": "first", "max": "last", "count": "days"}).to_string())
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="predmaint", description="Wind turbine early fault detection")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="fit, score and evaluate on the configured data")
    r.add_argument("--config", required=True)
    r.add_argument("--modes", nargs="+", default=["fleet", "self", "baseline"],
                   choices=["fleet", "self", "baseline"])
    r.add_argument("--no-report", action="store_true", help="skip figures")
    r.set_defaults(func=cmd_run)
    s = sub.add_parser("score", help="score new SCADA data with saved models")
    s.add_argument("--config", required=True)
    s.add_argument("--input", required=True)
    s.add_argument("--out", default="alarms.csv")
    s.add_argument("--mode", default="fleet", choices=["fleet", "self", "baseline"])
    s.set_defaults(func=cmd_score)
    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
