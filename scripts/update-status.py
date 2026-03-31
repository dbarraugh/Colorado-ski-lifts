#!/usr/bin/env python3
"""
update-status.py - Updates lift statuses for Colorado ski areas.

This script loads data/ski-areas.json, applies time-of-day rules (Mountain Time)
and simulates realistic lift conditions (weather holds, mechanical holds, etc.),
then writes the result back to the file with a fresh ISO 8601 timestamp.

To connect real data: replace the body of `simulate_area()` with calls to
resort lift-status APIs or scraping logic for each area.
"""

import json
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Mountain Standard Time (UTC-7). During MDT (summer) clocks are UTC-6,
# but ski season is typically in MST so UTC-7 is used here.
MOUNTAIN_TZ = timezone(timedelta(hours=-7))

# Resort operating hours (Mountain Time)
OPEN_HOUR = 8    # 8:00 AM – first lifts open
CLOSE_HOUR = 16  # 4:00 PM – last chairs stop loading (lifts formally close ~4:30)

# Chance per lift per 5-minute cycle that a currently-open lift goes on hold
HOLD_PROBABILITY = 0.04   # 4%

# Chance per lift per 5-minute cycle that a currently-held lift reopens
REOPEN_PROBABILITY = 0.30  # 30%


def is_operating_hours(now_mt: datetime) -> bool:
    """Return True if current Mountain Time is within normal ski resort hours."""
    return OPEN_HOUR <= now_mt.hour < CLOSE_HOUR


def simulate_area(area: dict, operating: bool, rng: random.Random) -> dict:
    """
    Return a copy of the ski area with updated lift statuses.

    During operating hours each open lift has a small chance of going on
    hold (weather/mechanical), and each held lift has a larger chance of
    reopening.  Outside operating hours all lifts are closed.
    """
    updated_lifts = []
    for lift in area["lifts"]:
        current_status = lift["status"]
        if not operating:
            new_status = "closed"
        elif current_status == "open":
            new_status = "closed" if rng.random() < HOLD_PROBABILITY else "open"
        else:
            new_status = "open" if rng.random() < REOPEN_PROBABILITY else "closed"
        updated_lifts.append({**lift, "status": new_status})
    return {**area, "lifts": updated_lifts}


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    data_path = repo_root / "data" / "ski-areas.json"

    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)

    now_utc = datetime.now(timezone.utc)
    now_mt = now_utc.astimezone(MOUNTAIN_TZ)
    operating = is_operating_hours(now_mt)

    # Seed the RNG on the current 5-minute window so results are stable
    # within a window but vary between windows.
    seed = int(now_mt.strftime("%Y%m%d%H")) * 100 + (now_mt.minute // 5)
    rng = random.Random(seed)

    data["skiAreas"] = [simulate_area(a, operating, rng) for a in data["skiAreas"]]
    data["lastUpdated"] = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    open_count = sum(
        1
        for a in data["skiAreas"]
        for lift in a["lifts"]
        if lift["status"] == "open"
    )
    print(
        f"Updated {data_path.name} at {data['lastUpdated']} "
        f"(operating={operating}, open_lifts={open_count})"
    )


if __name__ == "__main__":
    main()
