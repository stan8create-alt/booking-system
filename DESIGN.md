---
name: Zanchin Content Shoot Booking
description: The Studio Console — a soft neumorphic operator tool where shadow means state, not decoration, and Onyx is the only fill color that means "selected."
colors:
  bg: "#eceef1"
  surface: "#e8eaed"
  surface-raised: "#f0f2f5"
  white: "#ffffff"
  onyx: "#1a1a1a"
  signal-blue: "#3a7bd5"
  available-green: "#22c55e"
  filling-orange: "#f59e0b"
  full-red: "#ef4444"
  text: "#1a1a1a"
  text-muted: "#4b5563"
  dark-bg: "#0f1117"
  dark-surface: "#1a1d27"
  dark-surface-raised: "#1f2330"
  dark-accent-orange: "#fc6e20"
  dark-text-muted: "#9ca3af"
typography:
  section-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.3px"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  control:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  control-sm: "8px"
  control: "9px"
  control-lg: "10px"
  card: "14px"
  card-xl: "26px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  2xl: "26px"
components:
  button-primary:
    backgroundColor: "{colors.onyx}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
    typography: "{typography.control}"
  button-primary-selected:
    backgroundColor: "{colors.onyx}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    typography: "{typography.control}"
  list-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
    typography: "{typography.control}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control-lg}"
    padding: "12px 14px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.card-xl}"
    padding: "26px 26px 22px"
---

# Design System: Zanchin Content Shoot Booking

## 1. Overview

**Creative North Star: "The Studio Console"**

This is a control panel, not a marketing surface. Every surface reads like a soft-pressed physical console: pale grey planes with dual light/dark shadows implying real depth, buttons that visibly lift under the cursor and press flat when chosen. It's built for a small, fixed roster of strategists who use it a few times a week to reserve a real studio slot against a real calendar — precision and operator confidence matter more than warmth or delight. The tone states rules plainly ("72hr advance notice," "Max 6 shoots/week") rather than selling the experience.

The system explicitly rejects the generic 2024+ AI-SaaS look (gradient-on-white, purple/indigo accents, identical icon-card grids) and enterprise PM-tool clutter (nested toolbars, panels competing for attention, density for its own sake). Depth comes from one consistent shadow vocabulary, never from stacking effects — the moment two different signals (a fill color, a glow ring, a status dot) all claim to mean "this is selected" at once, the console stops reading as precise and starts reading as noisy. That failure mode is the thing this document exists to prevent.

**Key Characteristics:**
- Soft neumorphic surfaces — dual light/dark box-shadows (`--shadow-out` raised, `--shadow-in` pressed) are the entire elevation vocabulary; no drop-shadow-only or flat-with-border alternative exists alongside it.
- **Flat at rest, shadow as response.** A control only carries a shadow when it's being hovered, is actively selected, or is the one primary action on the screen — never as permanent texture.
- Onyx (`#1a1a1a`) is the single "this is selected / this is the primary action" color. Signal Blue (`#3a7bd5`) means "your cursor/focus is here," never "this is chosen."
- One font (Inter) carries every role; hierarchy comes from size/weight, not from mixing families.
- Light theme is grey-on-grey with an Onyx accent; dark theme (`data-theme="dark"`) swaps the entire accent role to a warm orange (`#fc6e20`) rather than keeping Onyx, since near-black has no contrast to give on a near-black background.

## 2. Colors

Grayscale-dominant with exactly two colors that carry meaning: Onyx for "chosen," Signal Blue for "your attention is here." A three-color status vocabulary (green/orange/red) exists solely for availability dots and never bleeds into button or selection states.

### Primary
- **Onyx** (`#1a1a1a`): The one "selected / primary action" color. Used for the submit button, the Verify & Continue button once armed, and every "this is what you picked" state (selected calendar day, selected time slot, selected duration tick). Always paired with white text. If a control isn't the thing the user picked or the one action to take next, it is never filled Onyx.

### Secondary
- **Signal Blue** (`#3a7bd5`, glow `rgba(58,123,213,.28)`): Hover and keyboard-focus only — border color plus a soft outer glow ring. Never combined with a fill color on the same element; a control is either "hovering toward selection" (blue ring, no fill) or "selected" (Onyx fill, no ring), never both at once. This is the single most important rule in this document, written to close the exact bug this system shipped with: a selected calendar day carrying an Onyx fill *and* a Signal Blue glow *and* a leftover status dot simultaneously.

### Neutral
- **Surface** (`#e8eaed`): Default background for every list control at rest (calendar days, time slots, suggestion cards, inputs).
- **Surface Raised** (`#f0f2f5`): Card backgrounds, and the hover background step for calendar days.
- **Background** (`#eceef1`): Page background — one step darker than Surface, so cards and controls read as sitting on top of it via the neumorphic shadow rather than a border.
- **Text** (`#1a1a1a`) / **Text Muted** (`#4b5563` light, `#9ca3af` dark): Primary reading text and secondary/label text respectively. Muted is tuned to clear 4.5:1 against `--surface-raised` in both themes — never drop it further via an added `opacity` on top; that compounding is what took the pre-Aug-2026 muted color under 2:1 on suggestion-card sub-labels.

### Status (availability dots only)
- **Available** (`#22c55e`), **Filling Up** (`#f59e0b`), **Full** (`#ef4444`): Exclusively the small calendar-day availability dots and their legend. Never repurposed as a button, border, or selection color — that would create a second "meaning" for green/orange/red beyond availability, which is exactly the kind of overload this document exists to prevent.

### Named Rules
**The One Selected Rule.** "Selected" has exactly one visual formula everywhere it appears — solid Onyx fill, white text, the same resting-elevation shadow every other raised control gets on hover (`--shadow-out`). Never a glow ring on top of a fill. Never a status dot surviving under a fill. If a new component needs a "this is chosen" state, copy this formula; do not invent a second one.

**The Dark-Theme Swap Rule.** Dark theme is not "light theme with a filter." `--accent`, `--accent2`, and `--neon`/`--neon-glow` all repoint to the same orange (`#fc6e20`) in dark mode — Onyx has no role there, since a near-black fill on a near-black background is invisible. Any new component that hardcodes `#1a1a1a` instead of `var(--accent)` will silently break in dark mode.

## 3. Typography

**UI Font:** Inter (400/500/600/700/800), with `sans-serif` fallback — every word and every number, no second family.

**Character:** Compact and label-driven. Nothing on this screen is a headline; the largest text on any given card is a 16px section title. Weight and letter-spacing carry hierarchy, not size jumps.

### Hierarchy
- **Section Title** (800, 16px, -0.3px): The "01 / 02 / 03" numbered block headers ("Your Details," "Date & Time"). One per card, never repeated within it.
- **Label** (700, 11px, 0.06em, uppercase): Every form field label and section sub-label ("YOUR NAME," "START TIME"). Uppercase + tracking is reserved for this one role — never apply it to body copy or button text, or it stops signaling "this is a field label."
- **Body** (500, 14px): Input values, paragraph copy, default reading text.
- **Control** (600, 13px): Button and list-control text (calendar days, time slots, suggestion cards, duration-tick labels).
- **Caption** (600, 10.5px, 0.05em): Sub-labels inside controls (the "OPEN"/"BOOKED" status under a time slot, the "QUICK"/"STANDARD" sub-line under a duration tick, the legend).

### Named Rules
**The Uppercase-Once Rule.** Uppercase + letter-spacing marks exactly one thing: a form field label. A button, a status caption, or a section title in uppercase would compete with that meaning — none of them use it.

## 4. Elevation

Neumorphic, and load-bearing to this system's whole identity — but its previous failure mode was applying the raised shadow (`--shadow-out`) to every control simultaneously, all the time, which turned "this button is interactive" into ambient texture nobody could read. The fix is procedural, not cosmetic: **shadow is assigned only in response to state, never at rest.**

- **At rest**: flat. Background color + a 1px border only (`var(--border)`, a translucent near-white so it reads as a hairline against the surface, not a hard edge). This applies to every calendar day, time slot, suggestion card, and duration tick with nothing else going on.
- **On hover**: `--shadow-out` (raised) plus a 2px Signal Blue ring. This is the *only* place shadow and the blue ring appear together — hover is explicitly "not yet chosen, but here's your cursor."
- **On selected**: `--shadow-out` alone, with an Onyx fill replacing the background. No ring.
- **On pressed/disabled**: no shadow. Disabled state is opacity (`.32`) only — an inset shadow on top of dimmed opacity was the second-largest source of this system's "muddy" complaint, since most cells in any given month are disabled (weekends, past dates, holidays) and each one used to carry its own inset shadow.
- **Cards** (the six numbered blocks) are the one place with permanent elevation — `--shadow-card`, always on, since a card is the top of this page's hierarchy and needs to read as detached from the page background at a glance, not just on interaction.

### Shadow Vocabulary
- **Raised** (`--shadow-out`: `5px 5px 12px rgba(170,176,190,.5), -3px -3px 8px rgba(255,255,255,.92)`): Hover and selected states on any interactive control.
- **Pressed** (`--shadow-in`: `inset 3px 3px 7px rgba(170,176,190,.4), inset -2px -2px 6px rgba(255,255,255,.88)`): Reserved for genuinely pressed-in surfaces — text input fields at rest (they read as a recessed slot you type into), never for disabled/inactive controls.
- **Card** (`--shadow-card`: `8px 8px 20px rgba(160,168,185,.4), -5px -5px 14px rgba(255,255,255,.95)`): The six numbered card containers only. One elevation tier above Raised, so a card always reads as "above" the controls inside it.

### Named Rules
**The Rest-Is-Flat Rule.** No control gets a shadow it didn't earn through hover or selection. A grid of thirty flat calendar cells with two or three shadowed ones (today, hovered, selected) is legible at a glance; thirty simultaneously-shadowed cells is not.

## 5. Components

### Buttons (primary actions: Verify & Continue, Confirm Booking)
- **Shape:** 9px radius (`--radius`, aliased `rounded.control`).
- **Fill:** Onyx, white text, 600 weight, full-width.
- **Disabled/unarmed:** same Onyx fill at reduced opacity — this is the one button role allowed to look "already there" before it's actionable, since it's always the single primary action on its card and never competes with a sibling.

### List Controls (calendar days, time-slot rows, suggestion cards, duration ticks)
One shared pattern — see §4 Elevation for the full state table. Character line: **quiet until touched.** Flat Surface background + hairline border at rest; `--shadow-out` + Signal Blue ring on hover; Onyx fill (no ring, no status dot) on selected.
- **Shape:** 9-10px radius, consistent across all four control types.
- **Calendar days** additionally carry a small availability dot (green/orange/red) at rest, which disappears once the day is selected — the Onyx fill already says "chosen," repeating "available" underneath it is redundant, not reinforcing.
- **Duration ticks** are the one exception to the fill rule: they're labels under a slider track, not standalone buttons, so "selected" there is Onyx *text* rather than an Onyx fill — the track's own thumb carries the fill instead.

### Cards (the six numbered form sections)
- **Corner:** 26px (`--radius-xl`) — the largest radius in the system, reserved for the top-level container so nothing nested ever out-rounds its parent.
- **Background:** Surface Raised, permanent `--shadow-card`, 1px hairline border.
- **Internal padding:** 26px sides, 22px bottom.
- **Section label:** an 8px-radius Onyx numbered badge (28×28px, white 800-weight number) + the Section Title, left-aligned, one per card.

### Inputs (text fields, comboboxes)
- **Style:** Surface background, `--shadow-in` (pressed-in), 10px radius (`--radius-sm`), 12/14px padding.
- **Focus:** border shifts to Signal Blue, `--shadow-in` plus a 3px Signal Blue glow ring added on top (the one place Signal Blue *does* combine with an existing shadow, since focus on an input is a different state grammar than hover/select on a button — the input is always "pressed in," focus just tells you which one).
- **Valid:** green border + glow, replacing the blue — signals successful entry, not hover.
- **Invalid:** red border + glow.

## 6. Do's and Don'ts

### Do:
- **Do** treat Onyx fill as the single, exclusive signal for "selected" or "primary action" — never pair it with a glow ring or a leftover status indicator (**The One Selected Rule**).
- **Do** keep every interactive control flat at rest and add shadow only for hover/selected states (**The Rest-Is-Flat Rule**).
- **Do** use `var(--accent)` / `var(--neon)` rather than hardcoded hex so components inherit the dark-theme orange swap correctly (**The Dark-Theme Swap Rule**).
- **Do** reserve uppercase + letter-spacing for form field labels only.
- **Do** keep the three status colors (green/orange/red) scoped to availability dots — never reuse them for a button or selection state.

### Don't:
- **Don't** stack a shadow, a glow ring, and a status dot on the same "selected" element — this was the concrete, named bug that started this document.
- **Don't** apply `--shadow-out` to a control at rest. Every simultaneously-shadowed grid (calendar, time list, suggestion strip) is the "muddy texture" failure mode.
- **Don't** apply an inset shadow to disabled controls on top of reduced opacity — opacity alone is enough, and the two together is what made most of a given month's calendar look pressed-in and murky.
- **Don't** introduce a second "primary" color alongside Onyx. If a new state needs its own color, it isn't actually primary.
- **Don't** build a generic SaaS dashboard (gradient-on-white, purple/indigo accent, identical card grids) or an enterprise PM-tool layout (nested toolbars, competing panels) — both are explicit anti-references in PRODUCT.md.
- **Don't** mix font families or introduce a display/heading face — Inter carries every role in this system.
