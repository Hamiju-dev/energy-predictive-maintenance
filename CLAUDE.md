# CLAUDE.md: project context for future sessions

## Goal
Portfolio project (master's in energy trading & energy management): **predictive
maintenance for wind turbines**. Detect developing component faults from SCADA data
*before* they cause alarms or outages. It is data-driven (condition-based), not
schedule-based. It is built as a **reusable tool** (`predmaint`): the demo dataset proves the
method, and a YAML config lets anyone run it on their own SCADA export.

Sibling portfolio repos: weather/PV forecasting, power price forecasting, project planner.

## Dataset
**Fuhrländer FL2500 wind farm**: 5 turbines (IDs 80–84, 2.5 MW), 2012-01 to 2014-12,
5-min SCADA (78 sensors × min/max/mean/std) plus the controller alarm log (start/end,
alarm code, system/subsystem, availability flag).
- Source: https://github.com/alecuba16/fuhrlander (pinned commit `6b16e4d`), author Alejandro Blanco-M.
- License: **Eclipse Public License v2.0** (stated in the source README). Credit the author.
- Known quirks (handled in `scripts/prepare_fuhrlander.py`): no SCADA Jun–Nov 2013;
  ~3,400 alarm rows with start year 2017 instead of 2014; exact 0.0 readings = sensor dropout;
  T84 down 107 days from Jun 2014.
- Preferred future dataset: **CARE to Compare** (Fraunhofer IEE, Zenodo, CC BY-SA 4.0, 44
  labelled fault events). Not used yet because `zenodo.org` is blocked by this cloud
  environment's network policy. Adding it = new adapter script + config, no core changes.

## Ground rules (must follow)
- Only public, openly licensed data. **Never** employer or client data. Note every dataset's license in README.
- **Never commit data.** `data/`, `outputs/`, `models/`, `*.csv`, `*.parquet`, `*.zip`, `*.bz2` are git-ignored.
  Data is fetched by `scripts/download_data.py` into `data/raw/`.
- **Never commit API keys.** Use `.env` (git-ignored); document variables in `.env.example`.
- Commit after each milestone with clear messages; develop on the session's feature branch.
- Write README for a recruiter skimming in 60 s: problem → data → approach → results with charts → how to run → next steps.

## Structure
```
configs/            fuhrlander.yaml (demo), template.yaml (for your own data)
scripts/            download_data.py, prepare_fuhrlander.py (raw JSON -> standard tables)
src/predmaint/      the tool
  config.py         YAML loading + validation + defaults
  data.py           read standard SCADA/events tables, map column roles
  features.py       model inputs (load, 1h/3h load, wind, ambient, rpm), normal-operation filter
  nbm.py            normal-behaviour models (LightGBM): fleet | self | baseline
  anomaly.py        residual z-scores -> daily component health score -> EWMA -> alarms
  evaluation.py     lead time per event, false-alarm episodes
  prediction.py     "event in next N days" classifier vs seasonal baseline
  pipeline.py       fit/score/evaluate orchestration, operating curve, Bundle (saved models)
  report.py         figures (reports/figures) + reports/results_<name>.md
  __main__.py       CLI: `python -m predmaint run|score`
notebooks/          01_eda.ipynb, 02_model_and_evaluation.ipynb (executed)
dashboard/          React 19 + Tailwind 4 + Vite front end; src/kit/ = the user's PV UI kit (keep its NOTICE.md:
                    parts adapted from EasyUI, MIT). Builds to ONE self-contained HTML (vite-plugin-singlefile);
                    scripts/to-artifact.mjs strips the document wrapper for publishing as a claude.ai artifact.
                    Data: scripts/export_dashboard_data.py -> dashboard/src/data/ (git-ignored).
reports/            figures/*.png, results_*.md, metrics_*.json (committed)
tests/              pytest unit tests + synthetic end-to-end test (no download needed)
data/ outputs/ models/   git-ignored
```

## Standard input format (what any user must provide)
- SCADA: timestamp, asset id, power, wind speed, ambient temp, [rotor speed], component temperature columns.
- Events (optional, for evaluation): asset id, component (or "turbine"), start, [end, kind, description].

## How to run
```bash
pip install -r requirements.txt && pip install --no-deps -e .
python scripts/download_data.py          # ~355 MB into data/raw/fuhrlander
python scripts/prepare_fuhrlander.py     # ~3 min -> data/processed/fuhrlander/{scada,events}.parquet
python -m predmaint run --config configs/fuhrlander.yaml   # ~10 min: 3 modes, figures, results md
python -m predmaint.prediction configs/fuhrlander.yaml     # failure-prediction experiment + figure
pytest -q
python scripts/export_dashboard_data.py && (cd dashboard && npm ci && npm run build)   # dashboard
```
Score new data with saved models: `python -m predmaint score --config configs/fuhrlander.yaml --input file.parquet --out alarms.csv`.

## Method decisions (why)
- Train on 2012 and test on 2013–2014 with a strict time split. Thresholds come from training-period scores only.
- **Fleet mode** (leave-one-turbine-out LightGBM) is the main model; self and no-model baseline are for comparison.
- **Static offsets are separated from change**: each turbine's median training residual is its offset
  (reported as *fleet screening*, `12_fleet_screening.png`; T81 gearbox +2 °C); monitoring removes it.
- **Common-mode rejection** (`anomaly.common_mode`): subtract the fleet's daily median score. All turbines'
  gearbox residuals drifted up together in 2013–14; without this, every turbine alarmed for months.
- **Threshold** = median over turbines of each turbine's 99th-percentile training score (a faulty turbine
  in the training fleet must not set the bar). Alarm needs 2 consecutive days above it.
- Training excludes 7 days before / 3 after temperature alarms and 30 days before major outages
  (a 30-day window for alarms removed 95 % of summer-2012 data, since every turbine trips on hot days).
- Events are split into **turbine-specific** (target) and **fleet-wide** (another turbine had the same
  alarm within ±2 days → weather/design limit, not a developing fault).
- Events with < 50 % SCADA coverage in the 30-day warning window are "not scorable", not misses.
- Only ~18 scorable test events: report results as indicative, show the operating curve, avoid over-claiming.

## Environment notes
- Cloud network allow-list: GitHub/raw.githubusercontent and PyPI work; zenodo.org, kaggle.com and edp.com are blocked.
- Python 3.13; versions pinned in requirements.txt.
