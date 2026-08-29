#!/usr/bin/env python3
"""Transform the raw EPA fueleconomy.gov vehicles.csv bulk export into a
bounded, curated Pax vehicle catalog JSON file. Source data is a US
government work (EPA / DOE fueleconomy.gov), public domain under 17 U.S.C.
Sec. 105 -- no license restriction on reuse or redistribution. See
docs/reuse-attribution.md for the full attribution entry.

This is a one-time, offline transform, not part of the Pax build or a
runtime dependency of the product (CLAUDE.md "Fixture mode must execute the
complete product without network access after installation"). It is checked
in for reproducibility and transparency about how the checked-in
`packages/catalog/data/vehicle-catalog.json` was produced, not wired into
any `pnpm` script.

To regenerate:

    curl -o epa-vehicles.csv https://www.fueleconomy.gov/feg/epadata/vehicles.csv
    python3 import-vehicle-catalog.py   # reads ./epa-vehicles.csv, writes ./vehicle-catalog.json

Source snapshot used for the checked-in data: retrieved 2026-08-29 from
https://www.fueleconomy.gov/feg/epadata/vehicles.csv
(Last-Modified: Fri, 07 Aug 2026 13:13:18 GMT, ETag "3d9b9836e26dd1:0").
"""
import csv
import json
import re
import sys

SOURCE_CSV = "epa-vehicles.csv"
OUT_JSON = "vehicle-catalog.json"
YEARS = {"2025", "2026"}
MAX_VARIANTS_PER_MODEL_YEAR = 2

# (make, base model prefix as it appears in the EPA `model` column)
CURATED = [
    ("Toyota", "Camry"),
    ("Toyota", "Corolla"),
    ("Toyota", "RAV4"),
    ("Toyota", "Highlander"),
    ("Toyota", "Prius"),
    ("Toyota", "Tacoma"),
    ("Toyota", "Sienna"),
    ("Honda", "Accord"),
    ("Honda", "Civic"),
    ("Honda", "CR-V"),
    ("Honda", "Pilot"),
    ("Honda", "Odyssey"),
    ("Nissan", "Altima"),
    ("Nissan", "Rogue"),
    ("Hyundai", "Elantra"),
    ("Hyundai", "Sonata"),
    ("Hyundai", "Tucson"),
    ("Hyundai", "Santa Fe"),
    ("Kia", "K5"),
    ("Kia", "Sportage"),
    ("Kia", "Telluride"),
    ("Mazda", "Mazda3"),
    ("Mazda", "CX-5"),
    ("Subaru", "Legacy"),
    ("Subaru", "Outback"),
    ("Subaru", "Forester"),
    ("Ford", "Escape"),
    ("Ford", "Explorer"),
    ("Ford", "F150"),
    ("Chevrolet", "Equinox"),
    ("Chevrolet", "Traverse"),
    ("Chevrolet", "Silverado"),
    ("Ram", "1500"),
    ("Jeep", "Grand Cherokee"),
    ("Jeep", "Wrangler"),
    ("Volkswagen", "Tiguan"),
    ("Chrysler", "Pacifica"),
    ("Tesla", "Model 3"),
    ("Tesla", "Model Y"),
    ("Tesla", "Model S"),
    ("BMW", "3 Series"),
    ("Mercedes-Benz", "C-Class"),
    ("Audi", "A4"),
]

VCLASS_MAP = {
    "Compact Cars": "Compact car",
    "Subcompact Cars": "Subcompact car",
    "Midsize Cars": "Sedan",
    "Large Cars": "Full-size sedan",
    "Small Station Wagons": "Wagon",
    "Midsize Station Wagons": "Wagon",
    "Small Sport Utility Vehicle 4WD": "Compact SUV",
    "Small Sport Utility Vehicle 2WD": "Compact SUV",
    "Standard Sport Utility Vehicle 4WD": "SUV",
    "Standard Sport Utility Vehicle 2WD": "SUV",
    "Sport Utility Vehicle - 4WD": "SUV",
    "Sport Utility Vehicle - 2WD": "SUV",
    "Minivan - 2WD": "Minivan",
    "Minivan - 4WD": "Minivan",
    "Vans, Cargo Type": "Van",
    "Vans, Passenger Type": "Van",
    "Standard Pickup Trucks 2WD": "Pickup truck",
    "Standard Pickup Trucks 4WD": "Pickup truck",
    "Standard Pickup Trucks": "Pickup truck",
    "Small Pickup Trucks 2WD": "Compact pickup truck",
    "Small Pickup Trucks 4WD": "Compact pickup truck",
    "Two Seaters": "Two-seater",
    "Minicompact Cars": "Minicompact car",
}

DRIVE_MAP = {
    "Front-Wheel Drive": "FWD",
    "Rear-Wheel Drive": "RWD",
    "All-Wheel Drive": "AWD",
    "4-Wheel or All-Wheel Drive": "AWD/4WD",
    "4-Wheel Drive": "4WD",
    "Part-time 4-Wheel Drive": "4WD (part-time)",
}


def norm_body_style(vclass: str) -> str:
    return VCLASS_MAP.get(vclass.strip(), vclass.strip() or None)


def norm_drivetrain(drive: str) -> str | None:
    drive = drive.strip()
    if not drive:
        return None
    return DRIVE_MAP.get(drive, drive)


def norm_fuel_type(fuel_type1: str, atv_type: str, fuel_type2: str) -> str:
    atv = atv_type.strip()
    ft1 = fuel_type1.strip()
    if atv == "EV":
        return "Electric"
    if atv == "PHEV":
        return "Plug-in hybrid"
    if atv == "Hybrid":
        return "Hybrid"
    if atv == "FFV":
        return "Flex-fuel"
    if atv == "Diesel" or ft1 == "Diesel":
        return "Diesel"
    if ft1 == "Premium Gasoline":
        return "Gasoline (premium)"
    if ft1 == "Regular Gasoline" or ft1 == "Midgrade Gasoline":
        return "Gasoline"
    if ft1 == "Electricity":
        return "Electric"
    return ft1 or "Unknown"


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-")


def derive_trim(model_field: str, base_model: str) -> str | None:
    rest = model_field[len(base_model):].strip()
    rest = rest.lstrip("- ").strip()
    return rest or None


def main() -> None:
    rows_by_key: dict[tuple, list[dict]] = {}
    with open(SOURCE_CSV, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["year"] not in YEARS:
                continue
            make = row["make"].strip()
            model_field = row["model"].strip()
            for cur_make, cur_base in CURATED:
                if make != cur_make:
                    continue
                if model_field == cur_base or model_field.startswith(cur_base + " "):
                    key = (cur_make, cur_base, row["year"])
                    rows_by_key.setdefault(key, []).append(row)
                    break

    records = []
    for (make, base_model, year) in sorted(rows_by_key.keys()):
        variants = rows_by_key[(make, base_model, year)]
        # Deterministic order: by trim text, then by EPA id.
        variants.sort(key=lambda r: (derive_trim(r["model"].strip(), base_model) or "", r["id"]))
        seen_signatures = set()
        picked = []
        for row in variants:
            comb08 = row["comb08"].strip()
            drive = row["drive"].strip()
            fuel = norm_fuel_type(row["fuelType1"], row.get("atvType", ""), row.get("fuelType2", ""))
            signature = (drive, fuel, comb08)
            if signature in seen_signatures:
                continue
            seen_signatures.add(signature)
            picked.append(row)
            if len(picked) >= MAX_VARIANTS_PER_MODEL_YEAR:
                break

        for row in picked:
            trim = derive_trim(row["model"].strip(), base_model)
            cylinders = row["cylinders"].strip()
            comb08 = row["comb08"].strip()
            record_id = "veh-" + slugify(f"{year}-{make}-{base_model}-{trim or 'base'}-{row['id']}")
            records.append({
                "id": record_id,
                "year": int(year),
                "make": make,
                "model": base_model,
                "trim": trim,
                "bodyStyle": norm_body_style(row["VClass"]),
                "drivetrain": norm_drivetrain(drive := row["drive"]),
                "fuelType": norm_fuel_type(row["fuelType1"], row.get("atvType", ""), row.get("fuelType2", "")),
                "combinedMpg": int(comb08) if comb08 and comb08 != "0" else None,
                "cylinders": int(cylinders) if cylinders and cylinders != "0" else None,
                "transmission": row["trany"].strip() or None,
                "source": {
                    "dataset": "epa-fueleconomy-gov",
                    "recordId": row["id"],
                },
            })

    records.sort(key=lambda r: (r["make"], r["model"], -r["year"], r["trim"] or ""))

    print(f"Total records: {len(records)}", file=sys.stderr)
    by_make = {}
    for r in records:
        by_make[r["make"]] = by_make.get(r["make"], 0) + 1
    for make, count in sorted(by_make.items()):
        print(f"  {make}: {count}", file=sys.stderr)

    with open(OUT_JSON, "w") as f:
        json.dump(records, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
