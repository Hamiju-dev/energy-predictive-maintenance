"""Download the public wind-turbine SCADA dataset into data/raw/.

Dataset: Fuhrländer FL2500 wind farm (5 turbines, 2012-2014, 5-min SCADA + alarm log)
Source:  https://github.com/alecuba16/fuhrlander  (author: Alejandro Blanco-M.)
License: Eclipse Public License v2.0 (as stated by the author in the source README)

Files are pinned to a fixed commit and verified with SHA-256, so every run gets
exactly the same bytes. Files that already exist with the right checksum are skipped.

Usage:
    python scripts/download_data.py            # all 5 turbines (~355 MB)
    python scripts/download_data.py --turbines 80 81
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT / "data" / "raw" / "fuhrlander"

COMMIT = "6b16e4dad72b37e02ad387e65d88ca19b8937043"
BASE_URL = f"https://raw.githubusercontent.com/alecuba16/fuhrlander/{COMMIT}/dataset"

FILES = {
    "wind_plant_data.json": "1aba9c3c15af90bff068f49344085508c92136f42130de9d47f11850d9d3ebd7",
    "turbine_80.json.bz2": "4a78592a2bd97f2db3692d19f373d74664b11afa9054b71223d3b8e0eec53a3d",
    "turbine_81.json.bz2": "b986e61de6cdf65641e56b00f84e33b9fc7d74d6ce0ca602c28314267cd93f56",
    "turbine_82.json.bz2": "507bee8320ce06428ff270ef7ac026a9bb6e33054ed3af5ae45ba896e40a6978",
    "turbine_83.json.bz2": "69905a427efb8ea3049ec5b868ed239f4f7a268e35663990fa158f5ecfc223a0",
    "turbine_84.json.bz2": "3a29c22ac5e8d1ddd1ec625e99f321afe3275e1e107fc2948d3a36aaea2d28c4",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(name: str, expected: str, retries: int = 4) -> None:
    dest = RAW_DIR / name
    if dest.exists() and sha256(dest) == expected:
        print(f"  ok      {name} (already downloaded)")
        return
    url = f"{BASE_URL}/{name}"
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            break
        except requests.RequestException as exc:
            print(f"  retry   {name} (attempt {attempt}: {exc})")
            if attempt == retries:
                raise
    got = sha256(tmp)
    if got != expected:
        tmp.unlink()
        raise RuntimeError(f"Checksum mismatch for {name}: {got} != {expected}")
    tmp.replace(dest)
    print(f"  fetched {name} ({dest.stat().st_size / 1e6:.0f} MB)")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--turbines", nargs="*", type=int, default=[80, 81, 82, 83, 84])
    args = p.parse_args(argv)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    wanted = ["wind_plant_data.json"] + [f"turbine_{t}.json.bz2" for t in args.turbines]
    print(f"Downloading Fuhrländer dataset to {RAW_DIR.relative_to(REPO_ROOT)}/")
    for name in wanted:
        if name not in FILES:
            print(f"Unknown file {name}", file=sys.stderr)
            return 1
        download(name, FILES[name])
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
