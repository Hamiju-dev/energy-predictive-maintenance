# Failure prediction (fleet health scores)

Target: thermal alarm or major outage starting within the next 14 days (turbine-day level). Train 2012-01-01–2013-01-01, test until 2015-01-01.

| features | model | roc_auc | pr_auc | base_rate | recall_at_10pct_budget | precision_at_10pct_budget | n_train_pos | n_test_pos | n_test |
|---|---|---|---|---|---|---|---|---|---|
| season | logistic | 0.611 | 0.249 | 0.155 | 0.187 | 0.346 | 269 | 235 | 1519 |
| season | lightgbm | 0.611 | 0.254 | 0.155 | 0.157 | 0.289 | 269 | 235 | 1519 |
| health | logistic | 0.528 | 0.197 | 0.155 | 0.196 | 0.207 | 269 | 235 | 1519 |
| health | lightgbm | 0.535 | 0.158 | 0.155 | 0.043 | 0.102 | 269 | 235 | 1519 |
| combined | logistic | 0.676 | 0.258 | 0.155 | 0.285 | 0.289 | 269 | 235 | 1519 |
| combined | lightgbm | 0.667 | 0.218 | 0.155 | 0.051 | 0.255 | 269 | 235 | 1519 |
