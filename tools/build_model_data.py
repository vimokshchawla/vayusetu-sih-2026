"""Convert VayuSetu model outputs (notebook v1.1) into the data the React frontend reads.

Usage (from the project root):
    python tools/build_model_data.py --outputs path/to/vayusetu_outputs --dataset path/to/VayuSetu_final_dataset

Writes:
    src/data/modelData.ts            engines, warnings, sensors and model metrics (imported by the app)
    public/data/engines/<id>.json    per-engine sensor history + RUL prediction history (loaded on the Diagnostics page)

Only pandas and numpy are needed. Re-run it whenever the ML notebook produces new outputs.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

SENSOR_LABELS = {
    "low_pressure_compressor_outlet_temperature_rankine": "LPC outlet temperature",
    "high_pressure_compressor_outlet_temperature_rankine": "HPC outlet temperature",
    "low_pressure_turbine_outlet_temperature_rankine": "LPT outlet temperature",
    "bypass_duct_pressure_psi": "Bypass duct pressure",
    "high_pressure_compressor_outlet_pressure_psi": "HPC outlet pressure",
    "fan_speed_rpm": "Fan speed",
    "core_speed_rpm": "Core speed",
    "engine_pressure_ratio": "Engine pressure ratio",
    "high_pressure_compressor_static_pressure_psi": "HPC static pressure",
    "fuel_flow_to_pressure_ratio": "Fuel flow / pressure ratio",
    "corrected_fan_speed_rpm": "Corrected fan speed",
    "corrected_core_speed_rpm": "Corrected core speed",
    "bypass_ratio": "Bypass ratio",
    "burner_fuel_air_ratio": "Burner fuel-air ratio",
    "bleed_enthalpy": "Bleed enthalpy",
    "high_pressure_turbine_coolant_bleed_lb_per_s": "HPT coolant bleed",
    "low_pressure_turbine_coolant_bleed_lb_per_s": "LPT coolant bleed",
}
# sensors offered in the Diagnostics sensor-history chart (the model's most important ones)
CHART_SENSORS = ["high_pressure_compressor_static_pressure_psi", "low_pressure_turbine_outlet_temperature_rankine",
                 "core_speed_rpm", "bypass_ratio", "high_pressure_compressor_outlet_temperature_rankine"]
MIN_DRIVER_FLIGHTS = 0.5   # same rule as the notebook: a driver must change predicted life by at least this much
EW_LEVEL, EW_HITS, EW_WINDOW = 30, 3, 5   # early-warning rule from the notebook


def short_id(uid: str) -> str:            # FD001_test_007 -> FD001-007
    sub, _, num = uid.split("_")
    return f"{sub}-{num}"


def as_list(v):
    return [float(x) for x in (json.loads(v) if isinstance(v, str) else v)]


def r1(x) -> float:
    return float(np.round(float(x), 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outputs", required=True, help="folder with the notebook's vayusetu_* output files")
    ap.add_argument("--dataset", required=True, help="folder with VayuSetu_train.csv and VayuSetu_test.csv")
    ap.add_argument("--project", default=str(Path(__file__).resolve().parents[1]))
    a = ap.parse_args()
    out, ds, proj = Path(a.outputs), Path(a.dataset), Path(a.project)

    pred = pd.read_csv(out / "vayusetu_test_predictions.csv")
    hist = pd.read_csv(out / "vayusetu_history_predictions.csv")
    eff = pd.read_csv(out / "vayusetu_driver_effects.csv").set_index("engine_uid")
    card = json.load(open(out / "vayusetu_model_card.json"))
    arena = pd.read_csv(out / "vayusetu_model_arena.csv")
    ledger = pd.read_csv(out / "vayusetu_feature_family_ledger.csv")
    train = pd.read_csv(ds / "VayuSetu_train.csv")
    test = pd.read_csv(ds / "VayuSetu_test.csv")
    sensors = [s for s in SENSOR_LABELS if s in eff.columns]
    assert len(pred) == pred.engine_uid.nunique(), "duplicate engines in predictions"
    assert set(pred.engine_uid) == set(eff.index), "driver effects do not match predictions"

    # ---------- engines ----------
    engines = []
    for r in pred.itertuples():
        e = eff.loc[r.engine_uid, sensors].astype(float)
        # drivers and their order come straight from the notebook (same rule, unrounded); effects give the sizes
        label_to_col = {v: k for k, v in SENSOR_LABELS.items()}
        nb_tops = [] if r.top_drivers == "none stands out" else [x.strip() for x in str(r.top_drivers).split(";")]
        nb_tops = [label_to_col.get(x, x) for x in nb_tops]
        ups = e[nb_tops]
        drivers = [{"sensor": SENSOR_LABELS[s], "direction": "Increasing risk", "influence": r1(v)} for s, v in ups.items()]
        top = SENSOR_LABELS[ups.index[0]] if len(ups) else "None stands out"
        if len(ups):
            interp = (f"{top} lowers the predicted remaining life the most ({ups.iloc[0]:.1f} flights compared with a healthy "
                      f"engine in the same flight condition). This is model influence only and does not confirm a physical fault.")
        else:
            interp = ("Wear shows up across several sensors at once, so no single sensor explains the prediction on its own "
                      "(changing any one sensor back to normal moves the estimate by less than half a cycle). "
                      "This is model influence only and does not confirm a physical fault.")
        engines.append({
            "id": short_id(r.engine_uid), "uid": r.engine_uid, "subset": r.subset, "lastCycle": int(r.flight_cycle),
            "p10": r1(r.p10), "medianRul": r1(r.p50), "p90": r1(r.p90), "band": r.band,
            "topDriver": top, "nextAction": r.recommended_action, "drivers": drivers, "interpretation": interp,
        })
    # the frontend recomputes the band from p10 - make sure rounding never moves an engine across a band line
    for e in engines:
        b = "RED" if e["p10"] <= 25 else "AMBER" if e["p10"] <= 60 else "GREEN"
        if b != e["band"]:
            e["p10"] = float(np.floor(e["p10"] * 10 + 1) / 10) if e["band"] != "RED" else e["p10"]
        assert ("RED" if e["p10"] <= 25 else "AMBER" if e["p10"] <= 60 else "GREEN") == e["band"], e["id"]
    engines.sort(key=lambda e: (e["subset"], e["id"]))

    # ---------- warnings: the notebook's early-warning rule replayed over each engine's flight history ----------
    warnings = []
    by_id = {e["uid"]: e for e in engines}
    for uid, g in hist.sort_values(["engine_uid", "flight_cycle"]).groupby("engine_uid"):
        hits = (g["p10"].values <= EW_LEVEL).astype(int)
        roll = pd.Series(hits).rolling(EW_WINDOW, min_periods=EW_WINDOW).sum().values
        idx = np.where(roll >= EW_HITS)[0]
        if not len(idx):
            continue
        fc = int(g["flight_cycle"].values[idx[0]])
        warnings.append({"id": "", "engineId": by_id[uid]["id"], "flight": fc,
                         "reason": f"Early-warning rule met at flight {fc}: P10 at or below {EW_LEVEL} flights on {EW_HITS} of the last {EW_WINDOW} flights",
                         "created": f"Flight {fc} · {by_id[uid]['lastCycle'] - fc} flights ago"})
    p10_of = {e["id"]: e["p10"] for e in engines}
    warnings.sort(key=lambda w: (p10_of[w["engineId"]], w["engineId"]))
    for i, w in enumerate(warnings):
        w["id"] = f"WARN-{i + 1:03d}"

    # ---------- per-engine history files ----------
    stats = train.groupby("flight_condition")[CHART_SENSORS].agg(["mean", "std"])
    edir = proj / "public" / "data" / "engines"
    edir.mkdir(parents=True, exist_ok=True)
    for old in edir.glob("*.json"):
        old.unlink()
    hist_g = dict(tuple(hist.groupby("engine_uid")))
    for uid, g in test.sort_values(["engine_uid", "flight_cycle"]).groupby("engine_uid"):
        rec = {"cycles": g["flight_cycle"].astype(int).tolist(), "sensors": {}}
        for s in CHART_SENSORS:
            m = stats.loc[g["flight_condition"].values, (s, "mean")].values
            sd = stats.loc[g["flight_condition"].values, (s, "std")].replace(0, 1).values
            rec["sensors"][SENSOR_LABELS[s]] = np.round((g[s].values - m) / sd, 2).tolist()
        h = hist_g[uid].sort_values("flight_cycle")
        assert h["flight_cycle"].tolist() == rec["cycles"], uid
        rec["p10"], rec["p50"], rec["p90"] = (np.round(h[c].values, 1).tolist() for c in ["p10", "p50", "p90"])
        json.dump(rec, open(edir / f"{short_id(uid)}.json", "w"), separators=(",", ":"))

    # ---------- model metrics ----------
    t = card["test_once"]
    best = arena.sort_values("rmse_uncapped")
    metrics = {
        "version": card.get("version", ""), "task": card["task"],
        "data": {"trainEngines": card["data"]["train_engines"], "testEngines": card["data"]["test_engines"],
                 "split": card["split_engines"], "source": card["data"]["source"]},
        "champion": {"names": card["champion"]["names"], "weights": card["champion"]["weights"],
                     "valRmse": r1(card["champion"]["val_rmse"])},
        "overall": {"rmse": r1(t["rmse_uncapped"]), "rmseCi": as_list(t["rmse_uncapped_95ci"]), "rmseCapped": r1(t["rmse_capped125"]),
                    "mae": r1(t["mae"]), "nasaScore": round(float(t["nasa_score"])), "coverage": float(t["range_cov_vs_capped"]),
                    "coverageLt50": float(t["range_cov_true_lt50"]), "width": r1(t["mean_range_width"])},
        "subsets": [{"subset": r["subset"], "engines": r["engines"], "rmse": r1(r["RMSE vs true"]), "ci": r["RMSE vs true 95% CI"],
                     "mae": r1(r["MAE"]), "coverage": float(r["range coverage"]), "width": r1(r["avg range width"])}
                    for r in card["test_results"] if r["subset"] != "ALL"],
        "ledger": [{"family": str(r.family_added).replace(" (base)", ""), "rmse": r1(r.mean_rmse),
                    "improvement": None if pd.isna(r.improvement) else r1(r.improvement), "kept": bool(r.kept)}
                   for r in ledger.itertuples()],
        "arena": [{"model": r.model, "valRmse": r1(r.rmse_uncapped), "valMae": r1(r.mae), "fitSeconds": r1(r.fit_seconds)}
                  for r in best.itertuples()],
        "calibration": {"method": card["calibration"]["method"], "calCoverage": float(card["calibration"]["cal_coverage_after_on_CAL"])},
        "earlyWarning": card["early_warning_cal"],
        "published": card.get("published_comparison_wins_out_of_4", {}),
        "limitations": card.get("limitations", []),
    }

    ts = ("// GENERATED by tools/build_model_data.py from the VayuSetu model outputs - do not edit by hand.\n"
          "import type { Engine, ModelMetrics, Warning } from '../types'\n\n"
          f"export const sensors: string[] = {json.dumps([SENSOR_LABELS[s] for s in CHART_SENSORS])}\n\n"
          f"export const modelMetrics: ModelMetrics = {json.dumps(metrics, indent=1)}\n\n"
          f"export const modelWarnings: Warning[] = {json.dumps(warnings, indent=0)}\n\n"
          f"export const modelEngines: Engine[] = {json.dumps(engines, indent=0)}\n")
    (proj / "src" / "data" / "modelData.ts").write_text(ts)

    counts = pd.Series([e["band"] for e in engines]).value_counts().to_dict()
    print(f"engines: {len(engines)} {counts} | warnings: {len(warnings)} | history files: {len(list(edir.glob('*.json')))}")


if __name__ == "__main__":
    main()
