# Frontend Redesign Brief — AI Product Marketing Platform

**Purpose of this document**: everything needed to redesign/restyle the frontend of this app — visual polish only. The backend, API contracts, and all data shapes below are FIXED and must not change. This document exists so a new UI can be designed against the real, exact behavior of the current app without needing access to the codebase.

---

## 1. What this product does

An internal tool that turns a Product Requirements Document (PRD, uploaded as a PDF) into a customer-facing "What's New" / "Coming Soon" product newsletter, automatically, using AI. The user (a product marketer) uploads a PDF, waits, and gets an editable draft newsletter back — with an honesty/grounding check that flags anything the AI wrote that isn't actually supported by the source document.

The whole system's guiding principle: **never invent facts that aren't in the source document.** If the PRD doesn't say something explicitly, the newsletter leaves it out rather than making something up. This shows up in the UI in a few places (see §5) and must be preserved — a "polished" redesign must not accidentally make missing/blank fields look like errors, since blank is often the CORRECT, honest state, not a bug.

---

## 2. Screens / states (single-page app, no routing)

There is exactly one page, with three main zones stacked vertically:

1. **Header** (static, always visible)
2. **Upload card** (always visible, top of page)
3. **Generated newsletter results** (appears only after a successful generation or when reopening a saved one — otherwise absent, no empty placeholder)
4. **Newsletter Library** (a grid of saved past newsletters — hidden entirely if the library is empty or unreachable)

### 2a. Header
Static text, centered:
- Title: **"AI Product Marketing Platform"**
- Subtitle: **"Generate high-quality product newsletters from PRDs."**

### 2b. Upload Card
A card titled **"Upload a PRD"**, subtitle **"Drop a PDF here, or click to browse your files."** Below that, a large dashed-border drop zone with FIVE distinct visual states:

| State | Trigger | Visual content |
|---|---|---|
| **Idle** | default | Upload-cloud icon, "Drag & drop your PDF here", "or click to upload · PDF only" |
| **Dragging** | file dragged over the zone | Same content, but border/background highlight (currently: border turns to accent color, faint accent background tint) |
| **Uploading** | file selected, upload in progress | Spinner icon, filename, a real progress bar (0-100%, driven by actual upload bytes sent), "Uploading · N%" |
| **Processing** | upload done, server generating | Spinner icon, filename, "Analyzing document and generating your newsletter · this can take a minute" (no progress bar here — server-side generation time isn't predictable) |
| **Error** | upload or generation failed | Document icon (destructive color), filename, the actual error message text, "Click or drop to try again" |
| **Done** | generation succeeded | Document icon (accent color), filename, "Newsletter generated · click or drop to replace" |

The whole drop zone is keyboard-accessible (Enter/Space triggers file picker) and disabled from re-triggering while busy (uploading/processing).

Only PDF files are accepted; anything else is silently ignored (no error shown — this could be improved on redesign, e.g. a toast/rejection message, but isn't currently required).

### 2c. Generated Newsletter Results
After a successful generation (or reopening a saved one from the library), **up to two newsletter cards appear side by side or stacked** — "What's New" and "Coming Soon." **A document can have either one, both, or (rarely) neither** — if a PRD describes only shipping/in-progress work, there's no "Coming Soon" card at all; if it describes only future/planned work, there's no "What's New" card. This is expected, not an error — do not design an empty-state placeholder implying something went wrong.

Each newsletter card contains, top to bottom:

1. **Section label** ("What's New" or "Coming Soon") + generation time (e.g. "generated in 2.3s")
2. **Verification status line** — see §5, this is important
3. **"Reset to AI draft"** button (discards manual edits, restores the original AI output)
4. **Title** — a punchy one-liner, e.g. "Spot Shifts: Streamline Rider Management!" — inline-editable
5. **Intro paragraph** — 2-3 sentences — inline-editable
6. **"Why We Built This"** section — OPTIONAL. If the AI didn't produce one (see §5), this shows only a ghost/outline **"+ Add Why We Built This"** button, no empty heading. If present, shows the heading + paragraph, each inline-editable, with a small delete (×) control.
7. **Navigation hint** — OPTIONAL one-liner, "You can find it in: X → Y → Z" (a literal breadcrumb path from the product). Absent entirely if the PRD didn't state one — most newsletters won't have this.
8. **Items list** — the actual feature announcements. Each item: a bold name + a paragraph body, both inline-editable, with move-up/move-down/delete controls per item. Always 1-4 items (never more — the AI enforces a hard ceiling here). An "+ Add item" ghost button always sits below the list to let the user manually add one.
9. **"What This Means To You"** — a bulleted list of short benefit statements, each inline-editable with move/delete controls, plus an "+ Add bullet" ghost button. Can be empty (just the heading + add-bullet button, no bullets) — this is normal for Coming Soon content especially.
10. **"What's Next"** — a single fixed teaser line for What's New ("Something exciting is coming soon - Stay tuned !!"); always EMPTY/absent for Coming Soon (a coming-soon newsletter doesn't tease a second future thing).
11. **Footer** — fixed company info (address, city, "Visit Website" link) — same on every newsletter, never edited.
12. **Export controls** — "Download HTML" and "Copy HTML" buttons per newsletter.

Below both cards (only when BOTH What's New and Coming Soon exist): an **"Export Combined"** card — "Both newsletters as one document, clearly separated," with its own Download/Copy HTML buttons.

**All text fields above are directly, inline editable** (click into text, it becomes an editable field) — this is a real content-editing surface, not a read-only preview. Preserve this in any redesign; it's core to the product ("review and refine before sending," not "take it or leave it").

### 2d. Newsletter Library
Heading **"Newsletter Library"**, with a search box (placeholder "Search by filename or title...") that filters by filename or document title, client-side, live-as-you-type. Below: a responsive grid of cards (1 column mobile, 2 tablet, 3 desktop), newest first. Each card:
- A small document icon
- A status badge, top-right (currently shows the newsletter type: "What's New" / "Coming Soon" / "Mixed")
- Document title (or "Untitled document" if the PRD had no clear title)
- "Updated {relative time}" (e.g. "2 hours ago")
- Source filename (truncated, full name on hover)
- If this PRD has been run more than once: a small note, "Re-run — N earlier version(s) of this file"

Clicking a card loads that saved newsletter into the same editor view described in §2c (fully editable again, exactly as if freshly generated — minus real generation-time/token stats, which aren't stored historically).

If the backend/database is unreachable, this whole section simply doesn't render — no error banner. The upload flow above works identically either way (persistence is optional, not load-bearing).

---

## 3. Design system currently in use (for reference, not mandatory to keep)

- **Framework**: React + Vite + Tailwind CSS, with a small shadcn/ui-style component layer (`Card`, `Button`, `Badge` — Radix-adjacent primitives with `class-variance-authority` variants).
- **Icons**: `lucide-react`.
- **Color tokens**: uses Tailwind CSS variables (`background`, `foreground`, `muted`, `muted-foreground`, `primary`, `destructive`, `border`) — a fairly neutral, minimal light theme currently, no dark mode implemented.
- **Layout**: single centered column, `max-w-5xl` (library) / `max-w-2xl` (upload card), generous vertical spacing, rounded-lg cards with subtle borders, no heavy shadows.
- This is a utilitarian, "get the job done" visual treatment today — functional but not art-directed. This is exactly the gap you're closing.

---

## 4. Full API contract (fixed — do not change)

Base URL: `http://localhost:4000` (configurable via `VITE_API_BASE_URL`).

### `POST /api/documents/upload`
Multipart form, field name `file` (a PDF). Returns (on success, HTTP 201):
```ts
{
  success: true
  filename: string
  originalName: string
  size: number
  uploadedAt: string        // ISO timestamp
  pages: number
  textLength: number
  rawText: string           // full raw extracted PDF text (not shown in UI today)
  cleanText: string         // cleaned text (not shown in UI today)
  newsletters: {
    whatsNew: NewsletterSection | null
    comingSoon: NewsletterSection | null
  }
}
```
On failure: `{ success: false, message: string }` with a non-2xx status.

### `GET /api/newsletters`
Returns the library list:
```ts
{
  success: true
  newsletters: Array<{
    id: string
    sourceFile: string
    documentTitle: string | null
    newsletterType: string        // "whatsNew" | "comingSoon" | "mixed"
    createdAt: string             // ISO timestamp
    isRerun: boolean
    totalRunsForFile: number
  }>
}
```

### `GET /api/newsletters/:id`
Returns one full saved newsletter:
```ts
{
  success: true
  id: string
  sourceFile: string
  documentTitle: string | null
  newsletterType: string
  createdAt: string
  content: {
    whatsNew: NewsletterJson | null
    comingSoon: NewsletterJson | null
  }
  verification: {
    whatsNew: VerificationReport | null
    comingSoon: VerificationReport | null
  }
}
```

### Shared shapes
```ts
interface NewsletterSection {
  newsletter: NewsletterJson
  metadata: WriterMetadata
  verification: VerificationReport
}

interface NewsletterJson {
  title: string
  intro: string
  whyBuilt: string | null
  navigation: string[]        // e.g. ["Spot Shifts/Loaned Riders"] or [] if none
  items: Array<{ name: string; body: string }>   // 1-4 entries typically
  meansToYou: string[]        // 0-6 short strings
  whatsNext: string           // fixed teaser or "" 
  footer: { address: string; city: string; websiteUrl: string }
}

interface WriterMetadata {
  model: string
  generationTimeMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  possibleOmissions: boolean
  missingSections: string[]
  navigationPathsPatched: string[]
}

interface VerificationReport {
  passed: boolean
  blocking: {
    fabricatedPaths: string[]      // navigation paths that couldn't be verified
    ungroundedItems: string[]      // item names with no matching source feature
  }
  advisory: {
    droppedFeatures: string[]      // real source features NOT included in this newsletter (expected — curation, not a bug)
    ungroundedClaims: Array<{ claim: string; why_ungrounded: string }>
  }
  check3Error: string | null       // set if the AI grounding check itself failed to run (network/quota) — distinct from "checked and clean"
}
```

---

## 5. Critical behavior to preserve (the "why" behind several UI choices)

This app's core value proposition is **trustworthiness** — a newsletter that confidently states something false is worse than one that's incomplete. Several UI patterns exist specifically to support that honestly, and a redesign that "cleans up" these patterns without understanding why could reintroduce the exact problem the product is designed to prevent.

1. **Null/blank fields are often correct, not broken.** `whyBuilt: null`, `navigation: []`, an empty `meansToYou`, or an entirely absent Coming Soon card can all be the honest, correct output when the source PRD simply doesn't say that thing. Do not add "no data available" placeholder text, warning icons, or visual treatments that make blank fields look like errors — a ghost "+ Add X" button (matching the existing pattern) is the right way to represent "empty, but you can add one yourself."

2. **The verification banner is load-bearing, not decorative.** Every generated newsletter shows either:
   - ✓ "Verified: all content grounded in source" (green/success), when `verification.passed === true`, or
   - ⚠ "N possible fabrications — review flagged items" (amber/warning) + "M advisory signals" when not passed.

   This must never be hidden, softened into a tooltip, or otherwise made less prominent — it's the mechanism that lets the user trust (or know to double-check) what the AI wrote. `blocking` issues are the real fabrication signals; `advisory` (dropped features, ungrounded claims) are lower-severity review prompts, not failures — the current design deliberately shows blocking and advisory counts differently in weight/color, and that distinction should survive a redesign.

3. **Everything in the newsletter card is inline-editable.** This isn't a "view" — it's a review-and-refine workspace. A redesign should preserve direct in-place editing (click text, it becomes editable) rather than moving to a separate "edit mode" toggle, modal, or read-only view with a disconnected editor.

4. **"Reset to AI draft"** must stay available and prominent — it's the undo mechanism for manual edits, letting the user experiment with rewrites without fear of losing the original AI output.

5. **Re-run / library semantics**: uploading the same PDF twice creates a NEW library entry (not an overwrite) with a "Re-run" note — the tool is explicitly a growing library across many PRDs over time, not a single-document workspace. Don't design the library as if there's only ever one "current" document.

6. **Loading states must distinguish upload vs. generation.** Uploading has a real, meaningful progress percentage; generation ("processing") does not (it can take upward of a minute, unpredictably) — don't fake a progress bar for the generation phase, a spinner + honest "this can take a minute" copy is correct.

---

## 6. What's explicitly NOT in scope for this redesign

- No changes to any request/response shape above.
- No changes to what fields exist, when they're null, or what triggers what backend behavior.
- No new screens, routes, or navigation structure beyond what's described — this is intentionally a single-page tool.
- Backend, AI pipeline, database schema: completely untouched, not to be discussed with or exposed to the redesign tool at all.

Everything else — typography, color, spacing, card treatment, iconography, animation, the exact layout arrangement of elements described above — is fair game to improve.
