# GW2 Elementalist Rotation Simulator & Build Optimizer

A client-side web tool that **accurately simulates Elementalist DPS** and optimizes gear for any rotation you build. Everything runs in the browser — no backend or login required.

---

## What it does

### Simulation engine

Unlike tools that apply a single damage formula, this simulator **replays your rotation event by event** the same way the game processes combat:

- Skill casts fire in sequence; each hit, tick, and proc is evaluated at its actual timestamp.
- Condition stacks are tracked individually — bleed, burn, torment, poison, confusion — with the correct damage formula per tick.
- Boons are tracked in real time: Might stacks, Fury, Alacrity, Quickness, Swiftness, etc. Quickness and Alacrity affect cast times and cooldowns during the simulation, including partial application (e.g. Quickness falling off mid-cast is handled correctly).
- Sigil procs (on-crit, on-hit, on-swap), relic triggers, and trait interactions (ICD-gated or event-driven) fire at the correct moments.
- **No real RNG.** Critical hit chance, weapon strength, and probabilistic procs (e.g. chance to apply a condition) all use their expected values, giving consistent and reproducible numbers.

### Build coverage

Every meaningful piece of the Elementalist build is modelled:

| Category | Coverage |
|---|---|
| Gear | All 12 equipment slots, full prefix list (Berserker's, Viper's, Assassin's, etc.), mixed prefixes |
| Weapon | All weapons implemented, correct weapon strength for utility/profession mechanics |
| Runes | Stat bonuses and relevant set bonuses |
| Sigils | Stat sigils (Accuracy, Force, Bursting, …) and proc sigils (Air, Earth, …) |
| Relics | Proc relics with their correct trigger conditions and cooldowns |
| Food & Utility | Flat stats, conversion-based utility consumables |
| Infusions | Up to 18 × any stat |
| Traits | All elementalist traitlines; minor and major traits including passive stat bonuses, on-event triggers, conversion bonuses, and condition modifiers |
| Boons | Might (stacking), Fury, Alacrity, Quickness, and more — manually configured uptime |

### Rotation builder

Build your skill sequence manually using the on-screen skill palette. The rotation panel shows cast time, DPS contribution, and cumulative time per skill. Run the simulation any time to see the full breakdown:

- Total DPS, strike DPS, condition DPS
- Per-skill damage contribution
- Condition uptime and average stacks
- Boon uptime
- Combat log to see each event

The builder also supports:

- **Concurrent instant-cast skills** via `Shift+click`, stored with a cast-start offset from the previous skill
- **Interrupted casts** via `Ctrl+click`, stored with an interrupt time in milliseconds
- An explicit **Combat Start** marker for precombat setup / opener timing
- **Dodge** as a rotation action, including endurance spend / regeneration and Vigor scaling

### Save & Load

Export your entire build — gear, traitline selections, skill rotation — as a JSON file. Import it back on any browser or share it with others.

---

## Gear Optimizer

Once you have a rotation, the optimizer finds the **best gear combination** for it, simply browsing whole combinatory space:

1. Choose which prefixes, runes, sigils, relics, food, and utility to test.
2. Optionally set minimum constraints (Boon Duration, Critical Chance, Toughness, Vitality).
3. Hit **Run** — the optimizer hill-climbs from multiple starting points in parallel, evaluating the full simulation for each candidate build.
4. The top-20 results are ranked by DPS and displayed with one-click apply.

Because the optimizer runs your actual rotation through the full simulator for every evaluation, the results account for all trait synergies, proc timing, and boon interactions — not just a stat formula.

**NOTE:** Optimization is much heavier than Discretize's optimizer, since we run whole rotation for each build (and re-calculate any trait/relic/sigil triggers). Using optimizer mainly with 1 prefix selected, but multiple Sigils/Relics (accurate procs) is advised.

---

## Technical notes

- Pure client-side HTML + CSS + JavaScript (ES modules). No framework, no build step.
- Optimizer parallelism via `Worker` threads (one per logical CPU core).
- GW2 skill and specialization data fetched from the official GW2 API and the GW2 Wiki, then cached in `localStorage`.
- Designed for Elementalist (Fire, Water, Air, Earth, Arcane, Tempest, Weaver, Catalyst). Other professions are not currently supported.

---

## Running locally

No build step or package install is required, but the app should be served from a simple local web server because the CSV data is fetched at runtime:

```bash
npx serve .
# or
python -m http.server
```

---

## Limitations & known assumptions

- **Skill list is intentionally incomplete** — only skills relevant to DPS are included. Utility skills, healing skills, and elite skills that have no meaningful damage contribution are omitted.
- **No elemental/pet simulation** — Lesser Elementals (Fire Elemental, Earth Elemental, etc.) are not simulated. Elite Glyph of Elementals always casts Fire variant and only (automatically) applies burning. Strike damage is not included (~520 DPS loss).
- **No healing / defensive simulation** — outgoing healing, barrier, and evade / survival gameplay are not modelled. Healing Power is tracked in attributes but has no effect on the simulation output.
- Healer and support builds are not the focus of this tool.
- Precombat support is based on an explicit **Combat Start** marker. This already handles many opener cases, but the list of combat-only proc exclusions is still curated and may need additional edge-case updates over time.

---

## Math and technical details

- **Modifier Contributions** are calculated by running the simulation once, then re-running it with a specific modifier disabled (one run per modifier).
- **Cast times** were manually gathered from `.evtc` logs and are treated as fixed values (even when in-game behavior sometimes vary depending on skill chaining or aftercasts).
- For **DPS calculations**, "start time" is the explicit `Combat Start` marker if one exists; otherwise it is the first damaging event time. "End time" is the end of the last cast event time (not hit time!) or the target death time, whichever is later.
- Without Quickness, cast times are multiplied by 4/3 (hit times are also affected).
- **Instant-cast skills** can be fired during another skill's cast window (`Shift+click`). This is handled by marking the instant-cast skill with an offset (in ms) from the start of the **previous** skill's cast window. Concurrent offsets have a minimum of `1ms`, so two rotation entries never begin at the exact same timestamp.
- **Interrupted casts** can be added with `Ctrl+click`. This stores an interrupt time from cast start, shortens the cast to that time, and only schedules hits that would normally occur before the interrupt.
- **Skill details** panel below the rotation shows total damage dealt, including condition ticks from this skill (unlike dps logs, which only show strike damage and aggregate each condition type).
- **Gear optimizer** searches whole combinatory space of gear prefixes, runes, sigils, relics, food, utility, and infusions. It uses current rotation to evaluate each build, making it **much heavier** than other optimizers. It is advised to use optimizer with 1 prefix selected, but multiple Sigils/Relics (accurate procs), or vice versa. 

---

If you spot any bugs or have any suggestions, please report them (https://github.com/SnappyJoeGW2/Elementalist-Simulator/issues) or contact me on Discord at https://discord.com/users/327133184665845770 (SnappyJoe#8710).
