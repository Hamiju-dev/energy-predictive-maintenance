# Wind Turbine Predictive Maintenance

Early fault detection for wind turbines from SCADA data: normal-behaviour models predict
component temperatures, and persistent deviations raise alarms *before* the turbine's own
alarm system or a failure.

🚧 Work in progress. Results, charts and the full write-up follow milestone by milestone.

Data: [Fuhrländer FL2500 wind farm](https://github.com/alecuba16/fuhrlander) (5 turbines, 2012–2014),
Eclipse Public License v2.0, author Alejandro Blanco-M.

```bash
pip install -r requirements.txt && pip install --no-deps -e .
python scripts/download_data.py
```
