# DIR-2 Implementation Plan
## Strict Group-Truth Semantics — Smart Expense

> **Status: PRE-CODE SPECIFICATION. No code written.**
> Decision: DIR-2 locked. Synthetic cross-group settlement amounts removed.
> Reference: Safety Audit (FINDING-01–09), Pre-Code Validation (Scenarios 1–10).

---

## 1. Exact Files to Modify

| File | Change Scope | Rationale |
|---|---|---|
| `src/hooks/useSmartSettlement.ts` | **MAJOR** | Root of every violation. Remove cap logic (lines 200–213), fix Phase 3 & 4, add `crossGroupNetAmount`/`hasReciprocal` fields, fix `buildPayStrategy.amount`. |
| `src/lib/smartSettlementPresentation.ts` | **MINOR** | `getDisplayStrategy` line 39: the `isPay` ternary `bestStrategy.debt.amount vs bestStrategy.amount` collapses to a single field after the hook fix. Simplify. |
| `src/components/BestStrategyCard.tsx` | **MINOR** | Two wording changes: reasoning label for multi-group persons; add cross-group net insight line to "After this:" section. |
| `src/components/SmartAssistantPanel.tsx` | **MINOR** | One label change: `"N groups · N balances"` → `"N groups · settle each separately"`. |

**Total files requiring code edits: 4**

### Files confirmed safe — DO NOT TOUCH

| File | Why safe |
|---|---|
| `src/pages/Dashboard.tsx` | `handleSettleAction(d)` already uses `d.groupId` and `d.amount`. Both will be correct after hook fix. Zero changes needed. |
| `src/pages/SettleUp.tsx` | Reads from `/groups/:id/balances` directly. No dependency on `useSmartSettlement`. |
| `src/hooks/useGroupBalance.ts` | Single-group scoped throughout. Untouched. |
| `src/pages/Balance.tsx` | Single-group scoped. Untouched. |
| `src/lib/actionContext.ts` | `SettleUpRouteState` shape unchanged. |
| `src/lib/invalidate.ts` | Cache invalidation bus unchanged. |
| `Smart Backend/**` | No backend changes required. |

---

## 2. Exact Data Structure Changes

### 2a. `OptimizedPlanItem` — `useSmartSettlement.ts` (lines 17–23)

**BEFORE:**
```ts
export interface OptimizedPlanItem {
  toUserId: string;
  toUserName: string;
  totalAmount: number;       // cross-group net — WRONG
  debts: EnrichedDebt[];     // amounts capped to sum to totalAmount — WRONG
  savingsCount: number;
}
```

**AFTER:**
```ts
export interface OptimizedPlanItem {
  toUserId: string;
  toUserName: string;
  totalAmount: number;          // NOW: raw sum of all per-group debt amounts (no netting)
  debts: EnrichedDebt[];        // NOW: raw per-group amounts — never capped
  savingsCount: number;
  crossGroupNetAmount: number | null; // NEW: net after receivable offsets — display insight only, never routed
  hasReciprocal: boolean;             // NEW: true when this person also owes you in another group
}
```

> [!IMPORTANT]
> `crossGroupNetAmount` is **display-only**. It is shown in `BestStrategyCard`'s "After this:" section as a relationship annotation. It is **never** passed to `handleSettleAction`, `SettleUpRouteState`, or any backend call.

---

### 2b. `BestStrategy` — `useSmartSettlement.ts` (lines 30–37)

**BEFORE:**
```ts
export interface BestStrategy {
  type: 'pay' | 'collect';
  debt: EnrichedDebt;    // first group's debt (capped amount)
  amount: number;        // totalAmount (net, may differ from debt.amount) — WRONG
  personName: string;
  groupCount: number;
  reasoning: string;
}
```

**AFTER:**
```ts
export interface BestStrategy {
  type: 'pay' | 'collect';
  debt: EnrichedDebt;    // first group's debt (raw, uncapped)
  amount: number;        // NOW always === debt.amount — INV-6 satisfied by construction
  personName: string;
  groupCount: number;
  reasoning: string;
}
```

INV-6 (`BestStrategy.amount === debt.amount`) is now a structural guarantee, not a fragile assertion.

---

### 2c. Phase 3 — `useSmartSettlement.ts` (lines 166–177)

**BEFORE (current broken behavior):**
```ts
for (const [personId, netCents] of netCentsByPerson) {
  if (netCents < 0) {
    for (const d of rawYouOweByPerson.get(personId) ?? []) youOweDebts.push(d);
  } else if (netCents > 0) {
    // Synthetic single entry with net amount — WRONG groupId, WRONG amount
    const entries = rawOwedToYouByPerson.get(personId) ?? [];
    const rep = [...entries].sort((a, b) => b.amount - a.amount)[0];
    owedToYouDebts.push({ ...rep, amount: netCents / 100 });
  }
  // netCents === 0: silently omitted — INV-9 violation
}
```

**AFTER:**
```ts
for (const [personId, netCents] of netCentsByPerson) {
  if (netCents < 0) {
    // Net: you owe them — all per-group debts flow unchanged
    for (const d of rawYouOweByPerson.get(personId) ?? []) youOweDebts.push(d);
  } else if (netCents > 0) {
    // Net: they owe you — all per-group receivables flow unchanged (no synthetic entry)
    for (const d of rawOwedToYouByPerson.get(personId) ?? []) owedToYouDebts.push(d);
  } else {
    // netCents === 0: exact cross-group cancellation.
    // POLICY (DIR-2): surface both sides. User must settle each group explicitly.
    // Resolves INV-9 violation from Scenario 4.
    for (const d of rawYouOweByPerson.get(personId) ?? []) youOweDebts.push(d);
    for (const d of rawOwedToYouByPerson.get(personId) ?? []) owedToYouDebts.push(d);
  }
}
```

---

### 2d. Phase 4 — Remove cap logic entirely — `useSmartSettlement.ts` (lines 200–213)

**DELETE these 14 lines in their entirety:**
```ts
// Cap each item's debts amounts to sum to exactly totalAmount.
for (const item of planMap.values()) {
  let remainingCents = Math.round(item.totalAmount * 100);
  item.debts = item.debts.reduce<EnrichedDebt[]>((acc, d) => {
    if (remainingCents <= 0) return acc;
    const dCents = Math.round(d.amount * 100);
    const take = Math.min(dCents, remainingCents);
    remainingCents -= take;
    acc.push(take === dCents ? d : { ...d, amount: take / 100 });
    return acc;
  }, []);
}
```

**Replace `planMap` construction (lines 184–198) with:**
```ts
const planMap = new Map<string, OptimizedPlanItem>();
for (const d of youOweDebts) {
  const existing = planMap.get(d.toUserId);
  if (existing) {
    existing.debts.push(d);
    existing.totalAmount = Math.round((existing.totalAmount + d.amount) * 100) / 100;
  } else {
    const rawOwedToYouCents = (rawOwedToYouByPerson.get(d.toUserId) ?? [])
      .reduce((s, x) => s + Math.round(x.amount * 100), 0);
    const netCents = netCentsByPerson.get(d.toUserId) ?? 0;

    planMap.set(d.toUserId, {
      toUserId: d.toUserId,
      toUserName: d.toUserName,
      totalAmount: d.amount,                              // will accumulate
      debts: [d],
      savingsCount: 0,
      crossGroupNetAmount: rawOwedToYouCents > 0 ? Math.abs(netCents) / 100 : null,
      hasReciprocal: rawOwedToYouCents > 0,
    });
  }
}
```

> [!NOTE]
> `totalAmount` accumulates the raw per-group debt amounts. For a person with no receivable, `totalAmount === sum(debts.map(d => d.amount))`. For a person with a reciprocal, `totalAmount` is still the raw owed sum — the net relationship is expressed only in `crossGroupNetAmount`.

---

### 2e. `buildPayStrategy` — `useSmartSettlement.ts` (lines 222–236)

**BEFORE:**
```ts
function buildPayStrategy(item: OptimizedPlanItem): BestStrategy {
  return {
    type: 'pay',
    debt: item.debts[0],
    amount: item.totalAmount,       // NET — may differ from debt.amount — WRONG
    personName: item.toUserName,
    groupCount: item.debts.length,
    reasoning:
      optimizedPlan.length === 1 && owedToYouDebts.length === 0
        ? 'You'll be fully settled after this'
        : item.debts.length > 1
          ? `Clears ${item.debts.length} groups with one action`  // FALSE
          : 'Biggest impact on your balance',
  };
}
```

**AFTER:**
```ts
function buildPayStrategy(item: OptimizedPlanItem): BestStrategy {
  return {
    type: 'pay',
    debt: item.debts[0],
    amount: item.debts[0].amount,   // raw group debt — INV-6 satisfied by construction
    personName: item.toUserName,
    groupCount: item.debts.length,
    reasoning:
      optimizedPlan.length === 1 && owedToYouDebts.length === 0
        ? 'You'll be fully settled after this'
        : item.debts.length > 1
          ? `Settle ${item.debts[0].groupName} first — ${item.debts.length} groups total`
          : 'Biggest impact on your balance',
  };
}
```

**Key change:** `amount: item.debts[0].amount` (raw per-group) replaces `amount: item.totalAmount` (cross-group net).

---

### 2f. `buildCollectStrategy` — `useSmartSettlement.ts` (lines 238–253)

**No structural change.** The collect strategy already uses `debt.amount` correctly. The only wording change mirrors the pay strategy:

```ts
// BEFORE:
? `Clears ${groupCount} groups with one action`   // FALSE when group debt ≠ net

// AFTER:
? `${groupCount} groups · largest balance first`
```

---

### 2g. `totalOwed` — `useSmartSettlement.ts` (line 219)

**No code change.** After the planMap fix, `totalOwed` naturally becomes the sum of all raw per-group debts:
```ts
const totalOwed = optimizedPlan.reduce((s, item) => s + item.totalAmount, 0);
// totalAmount is now raw sum — correct
```

---

### 2h. `isFullySettled` — `useSmartSettlement.ts` (line 287)

**No code change.** The existing check is correct:
```ts
isFullySettled: youOweDebts.length === 0 && owedToYouDebts.length === 0,
```
Under DIR-2, the `netCents === 0` (exact cancellation) case now pushes entries into both lists → `isFullySettled` correctly returns `false`. The "You're all settled" card no longer fires falsely.

---

### 2i. `smartSettlementPresentation.ts` — `getDisplayStrategy` (line 39)

**BEFORE:**
```ts
const amount = clampCurrency(isPay ? bestStrategy.debt.amount : bestStrategy.amount);
```
(This `isPay` ternary existed because `debt.amount` (capped) and `amount` (net) could differ for pay strategies.)

**AFTER:**
```ts
// debt.amount === bestStrategy.amount always (INV-6 by construction).
// The ternary is now semantically vacuous but can remain as a defensive no-op.
const amount = clampCurrency(bestStrategy.amount);
```

The `remainingTotalOwed` calculation on line 40 requires no change — its semantics become correct once `totalOwed` and `amount` are both raw group debts.

---

## 3. Exact UI Wording Changes

### 3a. `BestStrategyCard.tsx` — `reasoning` display for multi-group person

| Trigger | Before | After |
|---|---|---|
| `item.debts.length > 1` (pay) | `"Clears N groups with one action"` — **false** | `"Settle [GroupName] first — N groups total"` |
| `groupCount > 1` (collect) | `"Clears N groups with one action"` — **false** | `"N groups · largest balance first"` |
| Single group, one debt | `"Biggest impact on your balance"` | **No change** |
| Fully settled after action | `"You'll be fully settled after this"` | **No change** — now only fires when genuinely true |

### 3b. `BestStrategyCard.tsx` — "After this:" insight line for cross-group reciprocal

Add a third bullet to `outcomeLines` when `strategy.type === 'pay'` and `optimizedPlan[0].hasReciprocal`:

**BEFORE (`outcomeLines` construction, lines 210–221):**
```tsx
const outcomeLines = preview.remainingTotalOwedToYou > 0
  ? [remainingOwedLine, remainingOwedToYouLine]
  : [remainingOwedLine];
```

**AFTER:**
```tsx
const crossGroupInsight =
  isPay && result.optimizedPlan[0]?.hasReciprocal && result.optimizedPlan[0]?.crossGroupNetAmount != null
    ? `Net with ${personName} across all groups: ${formatSettlementCurrency(result.optimizedPlan[0].crossGroupNetAmount)}`
    : null;

const outcomeLines = [
  remainingOwedLine,
  ...(preview.remainingTotalOwedToYou > 0 ? [remainingOwedToYouLine] : []),
  ...(crossGroupInsight ? [crossGroupInsight] : []),
];
```

This insight line is visually identical to the other bullet points — it is explicitly phrased as a relationship net, not a payment amount.

### 3c. `SmartAssistantPanel.tsx` — Multi-group descriptor label (line 113)

**BEFORE:**
```tsx
{isMulti ? `${item.debts.length} groups · ${item.debts.length} balances` : `(${item.debts[0].groupName})`}
```

**AFTER:**
```tsx
{isMulti ? `${item.debts.length} groups · settle each separately` : `(${item.debts[0].groupName})`}
```

The old `"N groups · N balances"` phrasing implied a combined action. The new phrasing matches DIR-2 product contract rule 3: settlement actions remain group-scoped.

### 3d. All other wording — No change required

- `SmartAssistantPanel` explanation line (`"Paying X clears your balance fastest."`) — remains accurate.
- `BestStrategyCard` "You're all settled" card — remains accurate under DIR-2.
- `SettledState` and `RequestSentState` — unaffected.

---

## 4. Audit Findings Resolved by This Change

| Finding | Before DIR-2 | Resolution |
|---|---|---|
| **FINDING-01** — cross-group net shown as single-group settlement | `Dashboard.handleSettleAction` received `₹8500` for a `₹10000` group debt | `buildPayStrategy.amount = debt.amount` always; routing amount equals group debt |
| **FINDING-02** — `bestStrategy.amount` vs `debt.amount` ambiguity | Two fields diverged; `getDisplayStrategy` ternary was a band-aid | Both fields are now identical by construction; ternary is vacuous |
| **FINDING-03** — synthetic `owedToYouDebts` entry with wrong `groupId` | Phase 3 emitted one entry using the largest-debt group's ID with a net amount | Phase 3 now emits one real entry per group per person; each has its own correct `groupId` |
| **INV-6 violation** (Scenario 2) | `BestStrategy.amount ≠ debt.amount` in multi-group case | `amount = debts[0].amount` — identity holds structurally |
| **INV-9 violation** (Scenarios 4, 9, 10) | Dashboard showed net ≠ Balance page showed raw group debt | Dashboard now shows raw group debt — both surfaces read the same value |
| **INV-10 false positive** (Scenario 4 — exact cancellation) | `netCents === 0` silently omitted both sides; `isFullySettled = true` falsely | Both sides surfaced; `isFullySettled` correctly stays `false` |
| **INV-10 false positive** (Scenario 10 — post-settlement) | After paying ₹8,500, "You're all settled" card appeared; ₹1,500 open in G2 | Both sides surface correctly; `isFullySettled = false` until all ledger items cleared |

---

## 5. Findings Intentionally Deferred

| Finding | Reason | Risk Level |
|---|---|---|
| **FINDING-04** — `consolidate()` wrong arithmetic for duplicate `(from, to)` pairs | Only fires for rare duplicate entries across Phase 1+2. Produces correct results in normal usage. Requires a separate backend-only fix; out of scope for DIR-2. | LOW |
| **FINDING-05** — `useSmartSettlement` refetches all groups on any `balances` invalidation | Performance issue only, not a correctness violation. Acceptable until group counts grow large. Defer to a dedicated performance pass. | MEDIUM (perf only) |
| **FINDING-06** — `SettleUp.tsx` `remainingAmount` stale display window | Self-heals on re-fetch. Transient cosmetic artifact. No data integrity impact. | LOW |
| **FINDING-07** — Frontend duplicate-split check merge bug | Backend catches this via `DUPLICATE_SPLIT_USER` validation. No data integrity risk. | LOW |
| **FINDING-08** — `viewsInSync` check too narrow in `Balance.tsx` | Diagnostic gap only. No effect on calculation correctness. | LOW |
| **FINDING-09** — Stale `settled` actionContext in sessionStorage across sessions | Cosmetic UX issue. Does not affect settlement routing. | LOW |
| **VAL-3 / VAL-4** — dev-mode runtime checks from Safety Contract | Recommended hardening. Add as a follow-up task after DIR-2 ships. | LOW |

---

## 6. Regression Prevention Strategy

### 6a. Inline DEV-mode assertions to add in `useSmartSettlement.ts`

Add these guards immediately after `buildPayStrategy` is called. Gated on `import.meta.env.DEV` — zero production overhead.

**Assert INV-6 (strategy amount = debt amount):**
```ts
if (import.meta.env.DEV && bestStrategy?.type === 'pay') {
  if (Math.abs(bestStrategy.amount - bestStrategy.debt.amount) > 0.01) {
    console.error('[INV-6 VIOLATION] BestStrategy.amount !== debt.amount', {
      amount: bestStrategy.amount,
      debtAmount: bestStrategy.debt.amount,
      debt: bestStrategy.debt,
    });
  }
}
```

**Assert planItem.totalAmount = sum of debts:**
```ts
if (import.meta.env.DEV) {
  for (const item of planMap.values()) {
    const debtSum = item.debts.reduce((s, d) => s + Math.round(d.amount * 100), 0);
    const total = Math.round(item.totalAmount * 100);
    if (Math.abs(debtSum - total) > 1) { // 1 cent tolerance for floating point
      console.error('[INV-6 VIOLATION] planItem debts sum !== totalAmount', item);
    }
  }
}
```

**Assert no zero/negative amounts in youOweDebts:**
```ts
if (import.meta.env.DEV) {
  for (const d of youOweDebts) {
    if (d.amount <= 0) {
      console.error('[DATA] youOweDebts contains non-positive amount', d);
    }
  }
}
```

---

### 6b. Scenarios to manually verify after implementation

| # | Scenario | What to check | Pass condition |
|---|---|---|---|
| S1 | Single group debt only | Dashboard "Pay ₹X" → SettleUp pre-fills same ₹X | `displayed = routed = group debt` |
| S2 | Two groups, same direction | Dashboard plan shows `totalAmount = G1 + G2`; "Pay now" routes `debts[0].amount` (G1 only) | `routed = G1 debt, not combined` |
| S3 | Cross-group reciprocal | Dashboard: "Pay ₹10,000 to A (G1)"; insight line: "Net with A across all groups: ₹8,500"; SettleUp pre-fills ₹10,000 | `routed = 10000, not 8500` |
| S4 | Exact cancellation | Both G1 debt and G2 receivable visible; `isFullySettled = false`; no "You're all settled" | `both sides visible` |
| S5 | Partial cancellation | Dashboard: pay ₹10,000 (G1); insight: "Net: ₹8,500"; SettleUp: ₹10,000 | `no netting in routed amount` |
| S9 | Balance page consistency | Dashboard G1 debt amount === Balance page G1 simplified debt | `dashboard = balance page` |
| S10 | Post-settlement state | After paying ₹10,000 in G1: G1 residual ₹0, G2 receivable ₹1,500 open; no "fully settled" | `isFullySettled = false` |
| E1 | Manual SettleUp flow | Navigate to `/settle-up` directly; all amounts unchanged | No regression |
| E2 | GroupCard quick-pay | GroupCard routes `topSuggestion.amount` (single-group); unchanged | No regression |
| E3 | Genuine fully-settled | User with zero debts and zero receivables sees "You're all settled" | Correct positive |

---

### 6c. Updated data flow after DIR-2

```
/groups/:id/balances → simplifiedDebts (per group, raw amounts)
         │
         ▼ (fetched in parallel per group)
useSmartSettlement
  Phase 1: collect raw per-group debts keyed by personId
           rawYouOweByPerson, rawOwedToYouByPerson
  Phase 2: compute netCentsByPerson (cross-group net — used as INSIGHT ONLY)
  Phase 3: classify into youOweDebts / owedToYouDebts
           netCents < 0  → all youOwe entries (raw amounts) ✅
           netCents > 0  → all owedToYou entries (raw amounts, no synthetic) ✅
           netCents === 0 → BOTH sides (raw amounts, INV-9 fixed) ✅
  Phase 4: build planMap
           totalAmount = Σ raw per-group debt amounts ✅
           crossGroupNetAmount = |netCents| / 100 (display insight only) ✅
           NO cap logic ✅
  buildPayStrategy:
           debt = debts[0] (raw, uncapped) ✅
           amount = debts[0].amount (=== debt.amount) ✅
         │
         ▼
Dashboard.handleSettleAction(debt: EnrichedDebt)
  debt.groupId  = exact group to route ✅
  debt.amount   = exact group debt ✅
         │
         ▼
SettleUpRouteState { groupId, amount: debt.amount.toFixed(2) }
  → SettleUp reads /groups/:groupId/balances fresh ✅
  → fillFromDebt shows same amount ✅
  → backend validates: amount ≤ simplifiedDebt.amount ✅
```

---

## Summary

| Dimension | Before DIR-2 | After DIR-2 |
|---|---|---|
| `BestStrategy.amount` | Cross-group net (may differ from group debt) | Raw group debt (always === `debt.amount`) |
| `OptimizedPlanItem.totalAmount` | Cross-group net | Sum of raw per-group debts |
| Cap logic | Present (lines 200–213) | **Deleted** |
| Exact cancellation | Silently hidden; `isFullySettled` fires falsely | Both sides surfaced; `isFullySettled` correct |
| `owedToYouDebts` | One synthetic entry per person (wrong `groupId`, wrong amount) | One real entry per group per person |
| SettleUp pre-fill | Net amount (differs from Balance page) | Raw group debt (matches Balance page) |
| Cross-group insight | Encoded in routing amount (corrupts settlement) | Separate `crossGroupNetAmount` field (display only) |
| INV-6 | Violated structurally in multi-group case | Satisfied structurally |
| INV-9 | Violated in Scenarios 4, 9, 10 | Satisfied |
| INV-10 | False positive in Scenarios 4, 10 | Correct |
| Backend | — | Unchanged |
| Files changed | — | 4 frontend files only |
