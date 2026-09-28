---
target: "Date & Time block (index.html #datetime-section)"
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-08-31T05-05-25Z
slug: index-html-datetime-section
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Live remaining-bar, zone-info line, availability dots, disabled-reason tooltips keep status constantly surfaced |
| 2 | Match System / Real World | 3 | "All Day" duration is actually 6hrs — mismatches the literal phrase against the 4hr "Half Day" option |
| 3 | User Control and Freedom | 2 | Picking a new slot silently discards duration/preview with no undo cue — state just vanishes |
| 4 | Consistency and Standards | 1 | Onyx "selected" fill leaks onto two non-selected hover-preview states, one CSS block away from the correct Signal-Blue hover convention |
| 5 | Error Prevention | 3 | `dateBlockReason()` precomputes every disqualifying rule before render — invalid days are physically unclickable |
| 6 | Recognition Rather Than Recall | 3 | Persistent zone-info + legend reduce recall; uniform uppercase captions slightly undercut recognition by flattening hierarchy |
| 7 | Flexibility and Efficiency | 2 | Suggestion-strip shortcut is mouse-only — no keyboard/focus equivalent for the preview |
| 8 | Aesthetic and Minimalist Design | 3 | Clean at rest, but a confirmed mobile-width label collision (duration ticks) breaks it under real conditions |
| 9 | Error Recovery | 3 | Changing date cleanly resets slot/duration state; cost of a wrong pick is low, but no confirmation either way |
| 10 | Help and Documentation | 4 | The reason-string system (`BLOCK_LABELS`) *is* contextual help, delivered exactly where needed |
| **Total** | | **28/40** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict

**Does this look AI-generated?** No.

**LLM assessment (Assessment A):** No gradient text, no glassmorphism, no hero-metric cards, no identical-card-grid feel. The soft-neumorphic "Studio Console" language is applied with real discipline, and the `aria-label` reason strings (e.g. *"Wednesday, September 9, unavailable — No time left in the working day"*) read like a careful engineer's rule engine, not templated filler. The one AI-tell-adjacent pattern: uppercase-tracked captions are the default treatment for *every* small label in this card (weekday headers, duration sub-labels, suggestion sub-text) — DESIGN.md reserves that treatment exclusively for form field labels, so this reads as "over-systematized in-house app" rather than AI slop, but it is a real, repeated spec violation.

**Deterministic scan (Assessment B):** 160 total findings across the whole file; **27 fall in or near this block** (CSS selectors `.cal-`/`.slot-`/`.suggest-`/`.dt-`/`.dur-`, markup lines 697–757). Zero findings inside the block's JS logic. Breakdown of the in-scope 27: 6 `overused-font` (Inter — already the documented, intentional single typeface per DESIGN.md; not a real issue), 2 `bounce-easing` + 1 `layout-transition` on the duration slider's `cubic-bezier(.22,.68,0,1.15)` fill/thumb transition (a real hit against the "no bounce/elastic" motion rule — that curve overshoots past 1.0), and the remainder `design-system-color` advisories on the duration-slider disabled pattern and the Outlook/Google calendar-export buttons. The export-button colors (`#0072c6`, `#4285f4`) are third-party brand colors required for recognizability — flagged by Assessment B as a likely false positive, and also arguably out of strict scope since those buttons live on the confirmation screen, not inside `#datetime-section`, despite sharing the `.cal-` prefix. One global `numbered-section-markers` finding is also a false positive here — the 01/02/03 form-step badges are a real sequential flow, the documented exception to that rule.

**Visual overlays:** No script-injection overlay was shown in a [Human] browser tab for this run — Assessment B gathered evidence directly instead (live screenshots across 7 interaction states, keyboard-focus traversal, and in-page `getComputedStyle` contrast computation), which is reported below as concrete numbers rather than an overlay.

**Overlap between assessments:** Both independently caught the Onyx-fill-on-hover-preview issue — Assessment A named it as a Consistency violation from reading the CSS; Assessment B independently confirmed the exact same behavior live, screenshotting a solid-black "10:00am" preview button that does nothing when clicked. Both also converged on `--text-muted` contrast: Assessment A estimated it from the token values (~2.9:1 / ~3.2:1); Assessment B computed it precisely in-browser (**2.89:1 light / 3.24:1 dark** for slot-button and weekday text, and a worse **1.90:1 light / 2.14:1 dark** for suggestion sub-labels, which additionally carry `opacity:.65` on top of the already-low-contrast color). Independent convergence on the same two issues from two different methods is a strong signal, not a coincidence.

## Overall Impression

The bones here are genuinely good — this is a real rules engine (72hr window, zone locks, mall capacity) surfaced as plain-language UI copy, which is exactly what an "operator-grade, constraints stay visible" brief asks for, and it doesn't read as AI-generated in the slightest. But the block doesn't fully hold its own design system's rules: the One Selected Rule (its single most load-bearing visual convention) gets broken twice in this exact card, the muted-text color that drives most of the small type fails WCAG AA in both themes, and a real layout bug ships at mobile width. The biggest opportunity is tightening what's already built, not rethinking it — this is a polish problem, not a redesign.

## What's Working

1. **`dateBlockReason()` + per-day `aria-label` reasons** — every disabled calendar day states *why* ("Studio holiday," "This day already has a different mall's bookings") via both `title` and `aria-label`. This is "constraints stay visible, not hidden" implemented exactly as DESIGN.md specifies, and it's rare for an internal tool to bother at this level.
2. **The remaining-bar time preview** — a live green/orange/red fill showing how much of the working day a chosen duration consumes. It answers the strategist's actual anxiety ("will this eat the whole day?") without mental math, right at the moment of committing.
3. **Same-mall suggestion ranking**, first thing in the card — genuinely useful domain logic (group bookings at one mall into one studio trip) surfaced ahead of the raw calendar, matching the stated business goal directly rather than burying it.

## Priority Issues

**[P1] The "selected" Onyx fill leaks onto two states that are not actually selected**
- **Why it matters**: DESIGN.md's One Selected Rule exists so Onyx-fill means exactly one thing everywhere. `.cal-day.cal-suggest-hi` and `.slot-btn.preview.suggest-preview` both paint a *hovered, uncommitted* suggestion preview with the identical solid-fill/white-text formula reserved for real selection — one CSS block away from the correct `--neon` (Signal Blue) hover convention already used for the calendar day's own native hover. Confirmed live: hovering a suggestion card renders a solid-black, disabled "10:00am" button that looks exactly like a chosen slot but does nothing if clicked.
- **Fix**: Repoint both rules to `--neon`/`--neon-glow` (the existing hover language), never `--accent`. Selected means selected; preview should look like every other hover state in the file.
- **Suggested command**: `/impeccable polish`

**[P1] Body/label text fails WCAG AA in both themes, confirmed by exact computed ratios**
- **Why it matters**: `--text-muted` drives the default color of every unselected time-slot button, the calendar weekday headers, and (worse, via a compounding `opacity:.65`) the suggestion sub-labels. Measured live: **2.89:1** (light) / **3.24:1** (dark) for slot-button and weekday text, **1.90:1** (light) / **2.14:1** (dark) for suggestion sub-labels — all below the 4.5:1 floor PRODUCT.md explicitly requires, and the two lowest numbers are below even the relaxed 3:1 large-text threshold.
- **Fix**: Darken/lighten `--text-muted` until it clears 4.5:1 against `--surface-raised` in both themes, and drop the extra `opacity:.65` on `.suggest-card-sub` now that the base color will already read as appropriately secondary — stacking both is what pushes it under 2:1.
- **Suggested command**: `/impeccable audit` (contrast-focused) then `/impeccable polish`

**[P1] Duration silently auto-commits to 30 minutes the instant a time slot is picked**
- **Why it matters**: `selectSlot()` calls `selectDuration(30)` automatically and immediately on every slot click, rendered identically to a deliberate choice. For a tool where sessions routinely run 1–4 hours, defaulting to the shortest option with no "auto-picked, please confirm" signal risks a strategist submitting a 30-minute booking for what should be a 2-hour walkaround — a real business-cost mistake for exactly the "quick, in-and-out" power user (Alex) this tool is built for.
- **Fix**: Either don't pre-select a duration at all (require one explicit tap, matching the app's own "one clear action per screen" principle), or visually distinguish "auto-picked" from "you chose this" until the user actually interacts with the slider.
- **Suggested command**: `/impeccable clarify`

**[P2] Duration-tick labels collide at mobile width**
- **Why it matters**: Confirmed via `getBoundingClientRect()` at ~390px width: the "4 hr / HALF DAY" tick's sub-label rectangle overlaps the adjacent "All Day / FULL DAY" tick's sub-label by ~2.9px, rendering as visually colliding, partially-obscured text ("FULL DAY" reading as clipped behind "HALF DAY"). This is Casey's (mobile user) exact failure mode on a control that's otherwise well-built.
- **Fix**: Reduce the sub-label font-size or increase tick spacing at narrow viewports, or truncate/abbreviate the sub-labels below a breakpoint.
- **Suggested command**: `/impeccable adapt`

**[P2] Keyboard users get no suggestion-card preview before committing**
- **Why it matters**: `highlightSuggestDate()` is wired only to `onmouseenter`/`onmouseleave` — there's no `onfocus`/`onblur` equivalent. A mouse user gets to preview the date+slot a suggestion points to before clicking; a keyboard user tabbing to the same card and pressing Enter commits immediately with no preview. Confirmed live that focus rings themselves work correctly through the whole block (calendar cells, slot buttons, duration ticks all show a real, computed focus ring) — this is specifically a missing feature parity, not a broken focus system.
- **Fix**: Add `onfocus`/`onblur` handlers calling the same `highlightSuggestDate()` already used for mouse hover.
- **Suggested command**: `/impeccable adapt`

## Persona Red Flags

**Alex (Power User)**: Books a few times a week and wants speed. The silent 30-minute duration auto-commit (P1 above) is exactly the kind of default an impatient user blows past without noticing — Alex is the persona most likely to submit a wrong-duration booking because the UI never asked them to confirm it. The 12-slot + 5-tick + legend + zone-info surface area is also a lot to re-scan every single visit when Alex likely wants "same time as usual, just longer" — there's no shortcut for that beyond the same-mall date suggestions, which solve a different problem (which day, not which time/duration).

**Sam (Accessibility)**: The calendar and slot grid are genuinely well-built for Sam — confirmed live, every calendar cell and slot button is a real keyboard stop with a visible, computed focus ring, and disabled days carry full reason text in `aria-label`. Real gaps: the duration slider's `aria-valuenow` is a bare index (0–4) with no `aria-valuetext`, so a screen reader announces "2" instead of "1 hr"; the suggestion-card keyboard-preview gap above; and no `.slot-btn` carries an `aria-label` distinguishing "this one is currently selected" after the fact.

**Riley (Stress Tester)**: The "no suggestions in 45 days" empty state and the disabled-day reason system both hold up well under probing — no dead ends found. One live-confirmed bug for Riley to find: rapid-clicking across suggestion cards and calendar days doesn't break anything visibly (no console errors observed across the entire session), but `fetchGoogleBusy()`/`fetchDayZoneInfo()` fire on every date change with no visible request-cancellation guard, so a fast clicker could plausibly see a stale response land after a newer one — not confirmed live, but the code has no guard against it.

## Minor Observations

- Uppercase + letter-spacing is applied to nearly every small caption in this card (weekday headers, duration sub-labels, suggestion sub-text) — but DESIGN.md reserves that treatment exclusively for form field labels. The one caption class that's *not* uppercased (`.cal-legend`) makes the inconsistency visible even within the card's own habits.
- The duration slider's fill/thumb transitions use `cubic-bezier(.22,.68,0,1.15)` — a curve with slight overshoot, caught by the detector as `bounce-easing`. The general design rules explicitly call for exponential ease-out with no bounce/elastic; worth a straight `cubic-bezier` swap.
- "All Day" = 360 minutes (6 hours) labeled alongside "4 hr = Half Day" — a strategist unfamiliar with the studio's actual working hours could reasonably expect "All Day" to mean a full 8–12hr day rather than 6.
- The first suggestion card auto-renders already in the selected Onyx state on page load whenever a same-mall date exists — a real, intentional default, but nothing in the UI signals "this was picked for you, not required" versus a deliberate choice.
- `.slot-btn` uses `font-weight:700` even for disabled/booked slots at `opacity:.3` — bold weight on content that's meant to visually recede adds noise it doesn't need.

## Questions to Consider

1. If the One Selected Rule is meant to be load-bearing across the whole app, what would actually break by making the suggestion-card hover-preview use the exact same Signal Blue the calendar's own native hover already uses two lines of CSS away?
2. Duration is auto-set to the shortest option the instant a time is picked — is it actually a decision in this flow, or functionally a default most strategists will never touch? If the latter, should it drop the required-field asterisk and be framed as an editable default instead?
3. The `BLOCK_LABELS`/`dateBlockReason` reason system is the strongest part of this card — it's a rules engine surfaced as UI copy. Could the same mechanism roll up to a month-level summary ("14 of 22 weekdays booked out this month") instead of making a strategist discover blockage one dimmed day at a time?
