# Faults identified

## Plant creation omits location
- Issue: The `createPlant` flow never asks for or injects a location value when building the replacements map for the template, so new notes keep the raw `{{location}}` placeholder (or an empty field in the fallback template).
- Impact: Location is marked as a required field in the spec/schema, so generated notes violate the contract and the Today view will index plants with incomplete metadata.
- Evidence: Missing `location` entry in the replacements object.【F:src/main.ts†L239-L313】 Template expects `{{location}}`.【F:Templates/plant.md†L1-L49】 Requirement that `location` is mandatory.【F:SPEC.md†L12-L55】

## Plant IDs break for non-Latin names
- Issue: IDs are derived exclusively from a slug that strips any character outside `[a-z0-9]`. Names that only contain other characters (e.g. "Árbol" or emoji) produce an empty slug, yielding the ID `hp-`.
- Impact: Multiple plants can end up sharing the same ID and file name (`hp-.md`), violating the spec’s uniqueness guarantee and confusing downstream indexing.
- Evidence: Slug creation and fallback to `hp-${slug}` without recovery when the slug becomes empty.【F:src/main.ts†L239-L304】 Unique ID requirement.【F:SPEC.md†L12-L55】

## Winter months suppress watering prompts globally
- Issue: `computeWaterDue` treats any plant as “suppressed” whenever the current month is in `winter_months_uk`, regardless of the plant’s actual state.
- Impact: During winter, watering reminders disappear even for actively growing plants, contradicting the goal to guide watering by checks/phase while only suppressing **fertiliser** prompts.
- Evidence: Winter-month suppression logic in watering computation.【F:src/logic/watering.ts†L16-L58】 Spec expectations for watering vs. fertilising behaviour.【F:SPEC.md†L3-L60】【F:SPEC.md†L127-L132】
