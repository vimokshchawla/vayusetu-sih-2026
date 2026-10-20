"""Generate the HARD-CODED DEMO FLEET layer for the VayuSetu frontend.

The NASA C-MAPSS data only contains engines. To show fleet availability (aircraft, air bases, maintenance units)
this script builds a fictional fleet and fits every real model-scored engine into a fictional aircraft.
Engine predictions stay real; bases, aircraft, types, sortie rates and unit statistics are invented.

Usage (from the project root, after build_model_data.py):
    python tools/build_fleet_demo.py
Writes src/data/fleetDemo.ts. Deterministic: the same fleet every run (fixed seed).
"""
import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 26249

# Fictional bases placed at regional locations (not real airfields). lat/lon are approximate city-region points.
BASES = [
    ("B01", "Vayu Base Himgiri", "Jammu and Kashmir", "Northern", 33.8, 75.0, 1.15),
    ("B02", "Vayu Base Satluj", "Punjab", "Northern", 30.9, 75.6, 1.10),
    ("B03", "Vayu Base Marudhar", "Rajasthan", "Western", 26.6, 72.9, 1.05),
    ("B04", "Vayu Base Kutch", "Gujarat", "Western", 23.0, 70.5, 0.95),
    ("B05", "Vayu Base Ganga", "Uttar Pradesh", "Central", 26.6, 80.6, 1.00),
    ("B06", "Vayu Base Narmada", "Madhya Pradesh", "Central", 23.2, 77.4, 0.90),
    ("B07", "Vayu Base Sahyadri", "Maharashtra", "South Western", 18.6, 73.9, 0.95),
    ("B08", "Vayu Base Deccan", "Telangana", "Southern", 17.4, 78.4, 0.85),
    ("B09", "Vayu Base Kaveri", "Karnataka", "Southern", 13.0, 77.6, 0.80),
    ("B10", "Vayu Base Nilgiri", "Tamil Nadu", "Southern", 11.0, 77.0, 0.90),
    ("B11", "Vayu Base Hooghly", "West Bengal", "Eastern", 22.6, 88.4, 1.00),
    ("B12", "Vayu Base Brahmaputra", "Assam", "Eastern", 26.2, 91.7, 1.10),
]
# Fictional aircraft types: (type, role, engines per aircraft, base sorties/day, share of fleet)
TYPES = [
    ("VS-F1", "Single-engine fighter", 1, 1.2, 0.34),
    ("VS-F2", "Twin-engine fighter", 2, 1.0, 0.30),
    ("VS-T4", "Transport", 2, 0.7, 0.18),
    ("VS-J1", "Jet trainer", 1, 1.6, 0.18),
]
BASE_HEALTH = {"B01": -0.2, "B02": 0.9, "B03": 0.1, "B04": 1.3, "B05": 0.5, "B06": -0.6, "B07": 0.7, "B08": -0.4,
               "B09": 1.1, "B10": 0.3, "B11": -0.9, "B12": 0.0}
TYPE_BASES = {  # which bases operate which types (keeps the demo plausible)
    "VS-F1": ["B01", "B02", "B03", "B04", "B06", "B11", "B12"],
    "VS-F2": ["B01", "B02", "B03", "B05", "B07", "B10", "B12"],
    "VS-T4": ["B05", "B06", "B08", "B11", "B12"],
    "VS-J1": ["B08", "B09", "B10", "B07"],
}


def load_engines():
    ts = (ROOT / "src" / "data" / "modelData.ts").read_text()
    m = re.search(r"export const modelEngines: Engine\[\] = (\[.*\])\s*$", ts, re.S)
    return json.loads(m.group(1))


def main():
    rnd = random.Random(SEED)
    engines = load_engines()
    ids = [e["id"] for e in engines]
    rnd.shuffle(ids)

    aircraft, k, n = [], 0, 0
    counters = {}
    while k < len(ids):
        r = rnd.random()
        acc = 0
        for t in TYPES:
            acc += t[4]
            if r <= acc:
                break
        tname, role, n_eng, spd, _ = t
        if k + n_eng > len(ids):
            tname, role, n_eng, spd, _ = TYPES[0]
        base = rnd.choice(TYPE_BASES[tname])
        counters[tname] = counters.get(tname, 0) + 1
        n += 1
        in_maint = rnd.choice([0] * 30 + [3, 5, 8])   # ~9% of aircraft already in the hangar (days remaining)
        aircraft.append({
            "tail": f"{tname[3:]}-{100 + counters[tname]:03d}",
            "type": tname, "role": role, "baseId": base,
            "engineIds": [None] * n_eng,
            "sortiesPerDay": round(spd * (0.85 + 0.3 * rnd.random()), 2),
            "inMaintenanceDays": in_maint,
        })
        k += n_eng

    # fit engines: aircraft at healthier bases tend to get engines with more life left (plus noise, so every base has a mix)
    p10 = {e["id"]: e["p10"] for e in engines}
    slots = [(BASE_HEALTH[a["baseId"]] + rnd.gauss(0, 1.0), i, j) for i, a in enumerate(aircraft) for j in range(len(a["engineIds"]))]
    slots.sort()
    order = sorted(ids, key=lambda x: p10[x] + rnd.gauss(0, 18))
    for (_, i, j), eid in zip(slots, order):
        aircraft[i]["engineIds"][j] = eid

    bases = [{"id": b[0], "name": b[1], "state": b[2], "region": b[3], "lat": b[4], "lon": b[5], "tempo": b[6]} for b in BASES]
    for a in aircraft:  # base tempo factor scales the aircraft's sortie rate
        a["sortiesPerDay"] = round(a["sortiesPerDay"] * next(b["tempo"] for b in bases if b["id"] == a["baseId"]), 2)

    units = []
    for b in bases:
        jobs = rnd.randint(28, 74)
        on_time = rnd.randint(int(jobs * 0.62), int(jobs * 0.96))
        units.append({
            "id": f"MU-{b['id'][1:]}", "name": f"{b['name'].replace('Vayu Base ', '')} Maintenance Unit", "baseId": b["id"],
            "jobs90d": jobs, "onTime90d": on_time,
            "avgTurnaroundDays": round(rnd.uniform(3.2, 9.5), 1),
            "repeatDefectPct": round(rnd.uniform(2.0, 11.0), 1),
            "engineBays": rnd.choice([2, 3, 3, 4, 4, 6]),
            "sparesFillPct": rnd.randint(68, 97),
        })

    out = ("// GENERATED by tools/build_fleet_demo.py - HARD-CODED DEMO FLEET (fictional aircraft, bases and units).\n"
           "// Engine ids link to the real model predictions in modelData.ts. Do not edit by hand.\n"
           "import type { DemoAircraft, DemoBase, DemoUnit } from '../types'\n\n"
           f"export const demoAircraftTypes = {json.dumps([{'type': t[0], 'role': t[1], 'engines': t[2]} for t in TYPES], indent=1)}\n\n"
           f"export const demoBases: DemoBase[] = {json.dumps(bases, indent=1)}\n\n"
           f"export const demoUnits: DemoUnit[] = {json.dumps(units, indent=1)}\n\n"
           f"export const demoAircraft: DemoAircraft[] = {json.dumps(aircraft, indent=0)}\n")
    (ROOT / "src" / "data" / "fleetDemo.ts").write_text(out)
    used = sum(len(a["engineIds"]) for a in aircraft)
    print(f"bases {len(bases)} | aircraft {len(aircraft)} | engines fitted {used}/{len(engines)} | units {len(units)}")


if __name__ == "__main__":
    main()
