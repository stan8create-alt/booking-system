# Product

## Register

product

## Users

The dozen or so marketing strategists at 8Create who book content shoots for car dealerships across several Toronto-area auto malls, plus one admin (Stan) who manages the calendar and studio scheduling. Strategists use the booking form on desktop (occasionally mobile) in short, focused sessions a few times a week — pick a dealership, pick a date/time, confirm content packages, done. This is an internal ops tool, not a daily power-tool: users already know what they're doing and want to get in and out without friction.

## Product Purpose

Zanchin Content Shoot Booking is a private portal that lets authorized strategists reserve content-shoot sessions at dealerships without double-booking the studio's shared Google Calendar. It enforces per-auto-mall capacity and zone-lock rules, keeps a 72-hour minimum notice window, and — as of the latest phase — surfaces same-mall date suggestions so multiple dealerships in one auto mall get grouped into a single studio visit instead of separate trips. Success is a strategist booking correctly on the first try, with no double-bookings and minimal back-and-forth with the studio.

## Brand Personality

**Precise, technical, operator-grade.** Quiet confidence, no playfulness, clarity over warmth. It should feel like a well-built internal ops tool — efficient and trustworthy — not a marketed consumer product. The voice states rules plainly (72hr advance notice, Mon–Fri only, max 6 shoots/week) rather than selling the experience.

## Anti-references

- **Generic SaaS dashboard.** No gradient-on-white, no purple/indigo accent, no identical icon+heading card grids — the generic 2024+ AI-SaaS look.
- **Enterprise PM tool clutter.** No Jira/ClickUp-style nested toolbars, competing panels, or density-for-density's-sake.

## Design Principles

- **One clear action per screen.** Each step of the booking flow surfaces exactly what's needed right now (verify identity → pick date/time → contact → packages); nothing competes for attention with the current decision.
- **Consistency over novelty.** The same control — a button, a "selected" state, a shadow — means the same thing everywhere it appears. Strategists shouldn't have to re-learn the visual vocabulary block to block.
- **Constraints stay visible, not hidden.** Zone locks, mall capacity, and the 72-hour window are real business rules, not arbitrary UI restrictions. The interface should make "why can't I pick this" self-evident (a tooltip, a label) rather than a silent dead end.
- **Trustworthy over playful.** This handles real bookings against a real calendar used by a real studio. Every interaction should feel deliberate and low-risk — never cute, gamified, or decorative for its own sake.

## Accessibility & Inclusion

Target WCAG AA in both the existing light and dark themes: body text ≥4.5:1 contrast, large text ≥3:1. Honor `prefers-reduced-motion` with instant/crossfade fallbacks. Maintain visible focus states for keyboard use, since the form is filled out by hand at a desk.
