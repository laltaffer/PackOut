# PackOut — Domain Glossary

Vocabulary for this project. Terms here are canonical — use them in code, issues,
tests, and UI copy. Implementation details do not belong in this file.

## Trip
A planned backcountry outing (hunting, fishing, or similar) with a name, destination,
start date, and a fixed number of days. The unit everything else hangs off. Trips are
first-class and plural — several per year. Not called "hunt": trips are
activity-agnostic.

## Dashboard
The home screen: Trip cards in chronological order, upcoming/newest at top.

## Day
One calendar day of a Trip. Each Day has an Intensity and its own meal plan.

## Intensity
The V2P activity rating for a Day: Easy (little elevation change and/or <5 mi),
Medium (moderate elevation and/or 5–10 mi), Hard (significant elevation and/or >10 mi).
Drives the Day's nutrition targets.

## Meal Slot
One of the fixed V2P day divisions: Electrolytes/Fluid, Breakfast, Lunch, Dinner,
Snacks. The V2P doc is the gold standard for this structure. Meal-level targets attach
to slots (snack ~300 kcal / 40–60 g carbs each; breakfast 200–400 kcal; dinner ~25% of
daily kcal, ≥30–40 g protein, 60–90 g+ carbs).

## Snack
A bundle of one or more food items packed and eaten as a unit, judged as a whole
against the per-snack target. A Day carries as many Snacks as the user will pack
(V2P sheet shows five slots; the count is variable).

## Verdict
The per-Day sufficiency call. **Fueled** = day kcal ≥ 90% of target AND protein ≥ the
0.6 g/lb floor. **Short** = below either, stated with the concrete gap. **Heavy** =
over 115% of kcal target (soft warning — extra carried weight, not an error). Carbs and
fat are shown against their V2P ranges but never gate the Verdict. A Trip is Fueled
only when every Day is Fueled.

## Packed
The per-item checkbox state: this planned thing is physically in the pack. Applies to
food items (per Day) and, in Milestone 2, gear. There is no pantry/on-hand inventory
concept — readiness is about what's packed, not what's owned.

## Readiness
The Trip-level "am I ready?" view: every Day Fueled, every planned item Packed (food
now; gear and pre-trip Actions when Milestone 2 lands).

## Favorite
A food the user has explicitly marked as preferred. Suggestions rank Favorites first.

## Staple
A food PackOut detects as habitual from usage history (e.g. appears in every Trip, or
in most Days at the same meal). Detected deterministically — counting, not an LLM.
Staples are surfaced when planning new Days ("you use this every time").
