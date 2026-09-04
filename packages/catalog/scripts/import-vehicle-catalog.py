#!/usr/bin/env python3
"""Transform the raw EPA fueleconomy.gov vehicles.csv bulk export into a
bounded, curated Sift vehicle catalog JSON file. Source data is a US
government work (EPA / DOE fueleconomy.gov), public domain under 17 U.S.C.
Sec. 105 -- no license restriction on reuse or redistribution. See
docs/reuse-attribution.md for the full attribution entry.

This is a one-time, offline transform, not part of the Sift build or a
runtime dependency of the product (docs/engineering-principles.md "Fixture mode must execute the
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

## Column coverage

The source has 84 columns. This transform carries 82 of them. The two
omissions are exact duplicates, not judgement calls:

  * `co2`  duplicates `co2TailpipeGpm`  (integer vs float of the same value)
  * `co2A` duplicates `co2TailpipeAGpm` (same)

An earlier revision of this script carried only 10 columns and then 20,
selected by guessing which ones a car shopper would care about. That guess
was wrong in both directions: it dropped EPA's published annual fuel cost
(the single most decision-relevant number in the file) while keeping
internal identifiers. The rule now is to carry everything the source
publishes and let the product decide what to surface, because a field that
was never imported cannot be surfaced later without a re-import, while a
field that is imported and unused costs only disk.
"""
import csv
import json
import re
import sys
from datetime import datetime

SOURCE_CSV = "epa-vehicles.csv"
OUT_JSON = "vehicle-catalog.json"

# Every model year from EARLIEST_YEAR forward is kept.
#
# This was `YEARS = {"2025", "2026"}` -- the two most recent model years --
# which produced a 151-record catalog that could not contain a single one of
# the product's own demo candidates (a 2022 RAV4 at 28,400 miles, a Subaru
# Outback, a CR-V). The browse catalog and the hero demo were effectively
# disjoint datasets, and Sift is a *used*-car decision product: a shopper
# comparing a 2022 listing was browsing a catalog that started at 2025.
#
# Expressed as an open-ended floor rather than an explicit year set so a
# later re-import automatically picks up new model years (the source already
# carries 2027) instead of silently freezing at whatever was current when
# this constant was last edited.
EARLIEST_YEAR = 2016

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


def norm_body_style(vclass: str) -> str | None:
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


# ---------------------------------------------------------------------------
# Column readers.
#
# EPA does NOT use one convention for "not reported" -- it uses three, and
# which one applies depends on the column. Getting this wrong is not a
# cosmetic issue: a single shared `value <= 0 -> None` rule was applied
# across all numeric columns in an earlier revision and silently corrupted
# the catalog twice, both times in the direction that most misleads a
# shopper.
#
#   1. `youSaveSpend` is the 5-year amount saved (positive) or SPENT
#      (negative) versus an average new vehicle. Nulling negatives made the
#      catalog say "unknown" for precisely the thirstiest vehicles while
#      confidently reporting a number for the efficient ones.
#   2. `co2TailpipeGpm` is 0.0 for a battery EV -- a genuine MEASURED zero
#      (58 records in the current curated set, every one of them
#      `atvType == "EV"`). Nulling it erased an EV's single strongest number
#      and reported "unknown emissions" for the cleanest vehicles in the
#      catalog.
#
# So the policy is now declared per column at the call site, and the three
# readers below are named for the convention they implement rather than for
# a type. Adding a column means choosing one deliberately.
# ---------------------------------------------------------------------------


def text(row: dict, column: str) -> str | None:
    """A free-text column. Blank is the only "not reported" encoding."""
    return (row.get(column) or "").strip() or None


def measured(row: dict, column: str, cast, *, na_sentinel=None):
    """A column where 0 and negative values are REAL measurements.

    Used for `co2TailpipeGpm`/`co2TailpipeAGpm` (0 g/mi is the true tailpipe
    figure for a battery EV), `youSaveSpend` (negative means the vehicle
    costs MORE than average over five years; 0 is a genuine break-even --
    49 records sit exactly at the average, all at `fuelCost08` 2200), and
    `barrels08` (annual petroleum consumption, small but nonzero even for
    an EV because of upstream generation).

    `na_sentinel` is EPA's explicit "not available" marker for the column
    where one exists -- `-1` for the CO2 columns -- and is distinct from a
    measured value. It does not currently occur in the curated rows, but a
    future re-import covering new model years may include it, and treating
    -1 as a real gram-per-mile figure would be worse than any prior bug.
    """
    raw = (row.get(column) or "").strip()
    if raw == "":
        return None
    try:
        value = cast(raw)
    except ValueError:
        return None
    if na_sentinel is not None and value == na_sentinel:
        return None
    return round(value, 4) if cast is float else value


def applicable(row: dict, column: str, cast):
    """A column where 0 encodes "not applicable to this vehicle".

    EPA stores 0 rather than blank for a whole family of columns that only
    apply to some drivetrains or body styles: `range`/`charge240`/`cityE`
    on a gasoline car, the `phev*`/`*UF` columns on anything that is not a
    plug-in hybrid, and the interior-volume columns (`pv4`/`lv4`/`hpv`/
    `hlv`/`pv2`/`lv2`) on the vehicles EPA does not measure -- it publishes
    interior volume for every passenger car in the curated set, but for
    only 33 of its 432 SUVs and none of its pickups or minivans.

    None of these has a legitimate measured value of exactly 0 -- a car with
    0 cubic feet of passenger volume does not exist -- so collapsing 0 to
    None loses nothing real and correctly yields "unknown" rather than a
    fabricated zero that would sort as if it had been measured.
    """
    raw = (row.get(column) or "").strip()
    if raw == "":
        return None
    try:
        value = cast(raw)
    except ValueError:
        return None
    if value <= 0:
        return None
    return round(value, 4) if cast is float else value


def dual_fuel_measured(row: dict, column: str, cast, *, na_sentinel=None):
    """A second-fuel column where 0 is real, but only on a dual-fuel vehicle.

    `co2TailpipeAGpm` needs both rules at once and neither alone is right.
    On a plug-in hybrid whose second fuel is electricity, 0 g/mi is the true
    tailpipe figure for the electric side, so `applicable` would wrongly
    null it. But on the ~98% of the catalog with no second fuel at all, EPA
    also stores 0.0 -- meaning "not applicable" -- so `measured` reports a
    confident 0 g/mi of alternative-fuel emissions for cars that cannot burn
    an alternative fuel. That is a fabricated measurement, and it read as
    100% field coverage on a column that genuinely applies to 2% of rows.

    Gating on `fuelType2` separates the two: no second fuel means the
    question does not apply, and only then is 0 taken at face value.
    """
    if (row.get("fuelType2") or "").strip() == "":
        return None
    return measured(row, column, cast, na_sentinel=na_sentinel)


def rated(row: dict, column: str):
    """An EPA 1-10 score, where -1 means "not rated"."""
    raw = (row.get(column) or "").strip()
    if raw == "":
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if 1 <= value <= 10 else None


def yes_no(row: dict, column: str) -> bool | None:
    """A Y/N column. Blank is genuinely unknown, because N is available."""
    raw = (row.get(column) or "").strip().upper()
    if raw == "Y":
        return True
    if raw == "N":
        return False
    return None


def flag(row: dict, column: str, marker: str) -> bool:
    """A marker-or-blank column (`tCharger` = "T", `sCharger` = "S").

    This is the one place blank is read as a value rather than as unknown.
    EPA encodes these as a set-membership flag: the marker is present when
    the vehicle has the feature and the cell is empty when it does not, with
    no third state. A 2016 Camry is not "unknown turbocharged", it is not
    turbocharged. Reporting null here would make ~68% of the catalog claim
    ignorance about a fact the source does record.
    """
    return (row.get(column) or "").strip().upper() == marker


def boolean_text(row: dict, column: str) -> bool | None:
    """A literal "true"/"false" column (`phevBlended`)."""
    raw = (row.get(column) or "").strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    return None


def epa_date(row: dict, column: str) -> str | None:
    """`createdOn`/`modifiedOn`, e.g. "Fri May 29 00:00:00 EDT 2015".

    Normalised to a plain ISO `YYYY-MM-DD` date. The timestamp is always
    midnight and the zone alternates EST/EDT purely with the season, so
    neither carries information; keeping the raw string would just push the
    parsing problem onto every consumer. These two dates are real provenance
    -- when EPA first published and last revised this record -- which is
    exactly the kind of freshness signal Sift's evidence model cares about.
    """
    raw = (row.get(column) or "").strip()
    if raw == "":
        return None
    parts = raw.split()
    if len(parts) != 6:
        return None
    try:
        return datetime.strptime(
            f"{parts[1]} {parts[2]} {parts[5]}", "%b %d %Y"
        ).strftime("%Y-%m-%d")
    except ValueError:
        return None


def first_measured(*values):
    """First non-None of several mutually exclusive columns.

    EPA splits interior volume across three column pairs by body style --
    4-door (`pv4`/`lv4`), hatchback (`hpv`/`hlv`), and 2-door (`pv2`/`lv2`)
    -- and populates exactly one pair per vehicle. Consumers want "the
    passenger volume", so this collapses them while the raw per-body-style
    columns are still carried individually below for anyone who needs to
    know which measurement standard produced the number.
    """
    for value in values:
        if value is not None:
            return value
    return None


def derive_trim(model_field: str, base_model: str) -> str | None:
    rest = model_field[len(base_model):].strip()
    rest = rest.lstrip("- ").strip()
    return rest or None


def build_record(make: str, base_model: str, year: str, row: dict) -> dict:
    trim = derive_trim(row["model"].strip(), base_model)
    record_id = "veh-" + slugify(f"{year}-{make}-{base_model}-{trim or 'base'}-{row['id']}")

    passenger_volume = first_measured(
        applicable(row, "pv4", int), applicable(row, "hpv", int), applicable(row, "pv2", int)
    )
    luggage_volume = first_measured(
        applicable(row, "lv4", int), applicable(row, "hlv", int), applicable(row, "lv2", int)
    )

    return {
        # -- Identity ---------------------------------------------------
        "id": record_id,
        "year": int(year),
        "make": make,
        "model": base_model,
        "trim": trim,
        # EPA's own model strings, kept verbatim alongside our curated
        # split. `epaModel` is the full field ("CX-5 4WD"), `epaBaseModel`
        # is EPA's own base-model grouping, which does not always agree
        # with our `CURATED` prefix and is useful for cross-referencing
        # against other EPA-keyed datasets.
        "epaModel": text(row, "model"),
        "epaBaseModel": text(row, "baseModel"),
        "bodyStyle": norm_body_style(row["VClass"]),
        "epaVehicleClass": text(row, "VClass"),

        # -- Powertrain and engine --------------------------------------
        "drivetrain": norm_drivetrain(row["drive"]),
        "fuelType": norm_fuel_type(row["fuelType1"], row.get("atvType", ""), row.get("fuelType2", "")),
        # The grade of fuel the vehicle actually requires ("Premium",
        # "Regular", "Gasoline or E85"). Distinct from the normalised
        # `fuelType` above and a real running-cost factor a shopper feels
        # every week: premium-required is roughly a 10-15% fuel premium.
        "requiredFuel": text(row, "fuelType"),
        "primaryFuel": text(row, "fuelType1"),
        "secondaryFuel": text(row, "fuelType2"),
        "alternativeTechnology": text(row, "atvType"),
        "engineDisplacementL": applicable(row, "displ", float),
        "cylinders": applicable(row, "cylinders", int),
        "transmission": text(row, "trany"),
        "transmissionDetail": text(row, "trans_dscr"),
        "engineDetail": text(row, "eng_dscr"),
        "turbocharged": flag(row, "tCharger", "T"),
        "supercharged": flag(row, "sCharger", "S"),
        "startStopSystem": yes_no(row, "startStop"),
        "electricMotor": text(row, "evMotor"),
        "phevBlended": boolean_text(row, "phevBlended"),

        # -- Fuel economy, primary fuel ---------------------------------
        "combinedMpg": applicable(row, "comb08", int),
        "cityMpg": applicable(row, "city08", int),
        "highwayMpg": applicable(row, "highway08", int),
        # EPA publishes both a rounded window-sticker MPG and an unrounded
        # figure. The unrounded values are what you need to compare two
        # vehicles that both round to the same number.
        "combinedMpgUnrounded": applicable(row, "comb08U", float),
        "cityMpgUnrounded": applicable(row, "city08U", float),
        "highwayMpgUnrounded": applicable(row, "highway08U", float),
        # Raw dynamometer results before EPA's real-world adjustment.
        "unadjustedCityMpg": applicable(row, "UCity", float),
        "unadjustedHighwayMpg": applicable(row, "UHighway", float),

        # -- Fuel economy, alternative fuel -----------------------------
        # The second fuel of a dual-fuel vehicle: E85 in a flex-fuel car,
        # or the gasoline side of a plug-in hybrid.
        "altCombinedMpg": applicable(row, "combA08", int),
        "altCityMpg": applicable(row, "cityA08", int),
        "altHighwayMpg": applicable(row, "highwayA08", int),
        "altCombinedMpgUnrounded": applicable(row, "combA08U", float),
        "altCityMpgUnrounded": applicable(row, "cityA08U", float),
        "altHighwayMpgUnrounded": applicable(row, "highwayA08U", float),
        "unadjustedAltCityMpg": applicable(row, "UCityA", float),
        "unadjustedAltHighwayMpg": applicable(row, "UHighwayA", float),

        # -- Electric and charging --------------------------------------
        "electricRangeMiles": applicable(row, "range", float),
        "electricRangeCityMiles": applicable(row, "rangeCity", float),
        "electricRangeHighwayMiles": applicable(row, "rangeHwy", float),
        "altFuelRangeMiles": applicable(row, "rangeA", float),
        "altFuelRangeCityMiles": applicable(row, "rangeCityA", float),
        "altFuelRangeHighwayMiles": applicable(row, "rangeHwyA", float),
        # Electric consumption in kWh per 100 miles -- the EV equivalent of
        # MPG, and the number that actually drives an EV's running cost.
        "combinedKwhPer100Mi": applicable(row, "combE", float),
        "cityKwhPer100Mi": applicable(row, "cityE", float),
        "highwayKwhPer100Mi": applicable(row, "highwayE", float),
        "charge120Hours": applicable(row, "charge120", float),
        "charge240Hours": applicable(row, "charge240", float),
        "charge240bHours": applicable(row, "charge240b", float),
        "charger240Description": text(row, "c240Dscr"),
        "charger240bDescription": text(row, "c240bDscr"),

        # -- Plug-in hybrid charge-depleting operation ------------------
        "phevCombinedMpge": applicable(row, "phevComb", int),
        "phevCityMpge": applicable(row, "phevCity", int),
        "phevHighwayMpge": applicable(row, "phevHwy", int),
        "chargeDepletingCombinedMpge": applicable(row, "combinedCD", float),
        "chargeDepletingCityMpge": applicable(row, "cityCD", float),
        "chargeDepletingHighwayMpge": applicable(row, "highwayCD", float),
        # Utility factor: the share of miles SAE expects to be driven on
        # battery rather than gasoline. Without it a PHEV's blended MPG
        # figure cannot be interpreted.
        "combinedUtilityFactor": applicable(row, "combinedUF", float),
        "cityUtilityFactor": applicable(row, "cityUF", float),
        "highwayUtilityFactor": applicable(row, "highwayUF", float),

        # -- Cost --------------------------------------------------------
        "annualFuelCostUsd": applicable(row, "fuelCost08", int),
        "altAnnualFuelCostUsd": applicable(row, "fuelCostA08", int),
        "fiveYearSavingsVsAverageUsd": measured(row, "youSaveSpend", int),
        # Gas guzzler tax band, where one applies. Absent across the whole
        # current curated set, which is itself the honest answer rather
        # than a reason to drop the column.
        "gasGuzzlerTax": text(row, "guzzler"),

        # -- Emissions and environment ----------------------------------
        "fuelEconomyScore": rated(row, "feScore"),
        "greenhouseGasScore": rated(row, "ghgScore"),
        "altGreenhouseGasScore": rated(row, "ghgScoreA"),
        "co2GramsPerMile": measured(row, "co2TailpipeGpm", float, na_sentinel=-1),
        "altCo2GramsPerMile": dual_fuel_measured(row, "co2TailpipeAGpm", float, na_sentinel=-1),
        "annualPetroleumBarrels": measured(row, "barrels08", float),
        "altAnnualPetroleumBarrels": applicable(row, "barrelsA08", float),

        # -- Interior volume --------------------------------------------
        # Unified across EPA's three body-style-specific column pairs, with
        # the raw pairs retained so a consumer can tell which measurement
        # standard produced the figure. EPA measures interior volume for
        # cars but not for trucks and SUVs, so roughly a third of the
        # catalog has these and the rest are honestly null.
        "passengerVolumeCuFt": passenger_volume,
        "luggageVolumeCuFt": luggage_volume,
        "passengerVolume4DoorCuFt": applicable(row, "pv4", int),
        "passengerVolume2DoorCuFt": applicable(row, "pv2", int),
        "passengerVolumeHatchbackCuFt": applicable(row, "hpv", int),
        "luggageVolume4DoorCuFt": applicable(row, "lv4", int),
        "luggageVolume2DoorCuFt": applicable(row, "lv2", int),
        "luggageVolumeHatchbackCuFt": applicable(row, "hlv", int),

        # -- Provenance --------------------------------------------------
        "source": {
            "dataset": "epa-fueleconomy-gov",
            "recordId": row["id"],
            "epaEngineId": text(row, "engId"),
            "manufacturerCode": text(row, "mfrCode"),
            "createdOn": epa_date(row, "createdOn"),
            "modifiedOn": epa_date(row, "modifiedOn"),
            # Whether EPA holds owner-reported real-world MPG for this
            # vehicle, i.e. whether the published figure has been checked
            # against drivers rather than only a dynamometer.
            "hasUserMpgData": yes_no(row, "mpgData"),
        },
    }


def main() -> None:
    rows_by_key: dict[tuple, list[dict]] = {}
    with open(SOURCE_CSV, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_year = row["year"].strip()
            if not raw_year.isdigit() or int(raw_year) < EARLIEST_YEAR:
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
            records.append(build_record(make, base_model, year, row))

    records.sort(key=lambda r: (r["make"], r["model"], -r["year"], r["trim"] or ""))

    print(f"Total records: {len(records)}", file=sys.stderr)
    by_make: dict[str, int] = {}
    for r in records:
        by_make[r["make"]] = by_make.get(r["make"], 0) + 1
    for make, count in sorted(by_make.items()):
        print(f"  {make}: {count}", file=sys.stderr)

    # Field-level coverage, printed on every run so a re-import that
    # silently loses a column is visible immediately rather than at the
    # point some downstream feature quietly starts rendering "Unknown".
    if records:
        print(f"\nFields per record: {len(records[0]) - 1} + source", file=sys.stderr)
        print("Coverage:", file=sys.stderr)
        for field in records[0]:
            if field == "source":
                continue
            filled = sum(1 for r in records if r[field] is not None)
            print(f"  {field:32s} {100 * filled / len(records):5.1f}%", file=sys.stderr)

    with open(OUT_JSON, "w") as f:
        json.dump(records, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
