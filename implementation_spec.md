# Dir-2 Implementation Specification
## Strict Group-Truth Semantics — Smart Expense

> **Status: PRE-CODE SPECIFICATION. No code written.**
> Decision locked: DIR-2 — disable synthetic cross-group settlement amounts.
> Every settlement belongs to exactly one group. Every displayed payment amount equals the actual routed group debt.

---

## 1. Exact Files to Modify

| File | Role | Change Type |
|---|---|---|
| `src/hooks/useSmartSettlement.ts` | Core data transformation | **MAJOR** — remove cross-group netting from `OptimizedPlanItem`, redefine `BestStrategy` |
| `src/lib/smartSettlementPresentation.ts` | Display amount derivation | **MINOR** — simplify `getDisplayStrategy` now that `debt.amount = totalAmount` always |
| `src/components/BestStrategyCard.tsx` | Primary action card | **MINOR** — update wording for multi-group insight row |
| `src/components/SmartAssistantPanel.tsx` | Balance breakdown panel | **MINOR** — update group-count label and expand row display |
| `src/pages/Dashboard.tsx` | Routing on settle action | **NONE** — `handleSettleAction(d)` already uses `d.groupId` and `d.amount`; both will be correct after hook fix |
| `src/pages/SettleUp.tsx` | Settlement submission | **NONE** — already reads from `/groups/:id/balances` directly; no dependency on hook |
| `src/hooks/useGroupBalance.ts` | GroupCard data | **NONE** — already single-group scoped, untouched |
| `src/pages/Balance.tsx` | Balance page | **NONE** — already single-group scoped, untouched |
| `src/lib/actionContext.ts` | Route state types | **NONE** — `SettleUpRouteState` shape unchanged |

**Total files requiring code changes: 3**
(`useSmartSettlement.ts`, `smartSettlementPresentation.ts`, `BestStrategyCard.tsx`)
`SmartAssistantPanel.tsx` requires a label wording change only.

---

## 2. Exact Data Structure Changes

### 2a. `useSmartSettlement.ts` — `OptimizedPlanItem`

**CURRENT:**
```ts
export interface OptimizedPlanItem {
  toUserId: string;
  toUserName: string;
  totalAmount: number;       // ← cross-group net (may differ from sum of debts)
  debts: EnrichedDebt[];     // ← amounts capped to sum to totalAmount
  savingsCount: number;
}
```

**NEW:**
```ts
export interface OptimizedPlanItem {
  toUserId: string;
  toUserName: string;
  totalAmount: number;       // ← NOW: exact sum of all per-group debt amounts (no netting)
  debts: EnrichedDebt[];     // ← NOW: amounts are raw per-group values, never capped
  savingsCount: number;
  crossGroupNetAmount: number | null; // ← NEW: net after receivable offsets (display-only insight)
  hasReciprocal: boolean;    // ← NEW: true when this person also owes you in another group
}
```

**Why `crossGroupNetAmount`:** Preserves the relationship insight ("your net with this person across all groups is ₹X") as a display-only field. It is never used for routing or settlement amounts. It is shown as a subtle annotation in `SmartAssistantPanel`, not in `BestStrategyCard`.

---

### 2b. `useSmartSettlement.ts` — `BestStrategy`

**CURRENT:**
```ts
export interface BestStrategy {
  type: 'pay' | 'collect';
  debt: EnrichedDebt;   // ← first group's debt (capped amount)
  amount: number;       // ← totalAmount (net, may differ from debt.amount)
  personName: string;
  groupCount: number;
  reasoning: string;
}
```

**NEW:**
```ts
export interface BestStrategy {
  type: 'pay' | 'collect';
  debt: EnrichedDebt;   // ← first group's debt (raw, uncapped amount)
  amount: number;       // ← NOW always === debt.amount (INV-6 satisfied by construction)
  personName: string;
  groupCount: number;
  reasoning: string;
  // crossGroupNetAmount removed from here — lives on OptimizedPlanItem only
}
```

**INV-6 is now satisfied by construction**, not by a fragile cap assertion.

---

### 2c. `useSmartSettlement.ts` — Phase 3 & Phase 4 Logic (algorithm change)

**Phase 3 — current broken behavior to remove:**
```ts
// REMOVE: synthetic owedToYouDebts entry with net amount
const rep = [...entries].sort((a, b) => b.amount - a.amount)[0];
owedToYouDebts.push({ ...rep, amount: netCents / 100 }); // ← synthetic net amount
```

**Phase 3 — new behavior:**
```ts
// Each real per-group receivable becomes its own entry in owedToYouDebts
// No netting applied — amounts remain raw per-group values
for (const [personId, netCents] of netCentsByPerson) {
  if (netCents < 0) {
    // You owe them — all per-group debts flow into youOweDebts unchanged
    for (const d of rawYouOweByPerson.get(personId) ?? []) youOweDebts.push(d);
  } else if (netCents > 0) {
    // They owe you — all per-group receivables flow into owedToYouDebts unchanged
    for (const d of rawOwedToYouByPerson.get(personId) ?? []) owedToYouDebts.push(d);
  } else {
    // netCents === 0: exact cross-group cancellation
    // POLICY DECISION: surface both sides, let user settle each group explicitly
    // This resolves the INV-9 violation from Scenario 4 of validation
    for (const d of rawYouOweByPerson.get(personId) ?? []) youOweDebts.push(d);
    for (const d of rawOwedToYouByPerson.get(personId) ?? []) owedToYouDebts.push(d);
  }
}
```

> [!IMPORTANT]
> The `netCents === 0` (exact cancellation) case is explicitly surfaced under Dir-2. This is the correct behavior — the user has two real open ledger items. Dashboard must not hide them. This directly resolves the INV-9 violation from Scenario 4.

**Phase 4 — remove cap logic entirely:**
```ts
// REMOVE these lines (lines 200–213 in current file):
for (const item of planMap.values()) {
  let remainingCents = Math.round(item.totalAmount * 100);
  item.debts = item.debts.reduce<EnrichedDebt[]>((acc, d) => { ... }, []);
}
```

**Phase 4 — new `planMap` build:**
```ts
// totalAmount = sum of all raw per-group debt amounts (no netting)
for (const d of youOweDebts) {
  const existing = planMap.get(d.toUserId);
  if (existing) {
    existing.debts.push(d);
    existing.totalAmount = roundCurrency(existing.totalAmount + d.amount);
  } else {
    // Compute cross-group net for insight annotation (display only)
    const netCents = netCentsByPerson.get(d.toUserId) ?? 0;
    const rawTotalCents = (rawYouOweByPerson.get(d.toUserId) ?? [])
      .reduce((s, x) => s + Math.round(x.amount * 100), 0);
    const reciprocalCents = (rawOwedToYouByPerson.get(d.toUserId) ?? [])
      .reduce((s, x) => s + Math.round(x.amount * 100), 0);

    planMap.set(d.toUserId, {
      toUserId: d.toUserId,
      toUserName: d.toUserName,
      totalAmount: d.amount,            // will accumulate per-group amounts
      debts: [d],
      savingsCount: 0,
      crossGroupNetAmount: reciprocalCents > 0 ? Math.abs(netCents) / 100 : null,
      hasReciprocal: reciprocalCents > 0,
    });
  }
}
```

---

### 2d. `useSmartSettlement.ts` — `buildPayStrategy` change

**CURRENT:**
```ts
function buildPayStrategy(item: OptimizedPlanItem): BestStrategy {
  return {
    ...
    debt: item.debts[0],          // capped debt
    amount: item.totalAmount,     // net amount (may differ from debt.amount)
    reasoning: item.debts.length > 1
      ? `Clears ${item.debts.length} groups with one action`  // ← FALSE under old logic
      : ...
  };
}
```

**NEW:**
```ts
function buildPayStrategy(item: OptimizedPlanItem): BestStrategy {
  return {
    type: 'pay',
    debt: item.debts[0],          // raw per-group debt — amount is exact
    amount: item.debts[0].amount, // === debt.amount always — INV-6 satisfied
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

**Key change:** `amount: item.debts[0].amount` instead of `amount: item.totalAmount`. The BestStrategy now routes to Group 1's debt at its exact group amount.

---

### 2e. `useSmartSettlement.ts` — `totalOwed` and `totalOwedToYou`

**CURRENT:**
```ts
const totalOwed = optimizedPlan.reduce((s, item) => s + item.totalAmount, 0);
// totalAmount was the cross-group net — now it's the raw sum
```

**NEW — no code change needed.** `totalOwed` naturally becomes the sum of all raw per-group debts because `item.totalAmount` now accumulates raw amounts. This is the correct value to display ("you owe ₹X across all groups").

---

### 2f. `useSmartSettlement.ts` — `isFullySettled` — exact cancellation case

**CURRENT:**
```ts
isFullySettled: youOweDebts.length === 0 && owedToYouDebts.length === 0,
```

**NEW — no code change needed.** Since the `netCents === 0` case now pushes entries into both lists, `isFullySettled` will correctly be `false` when exact cross-group cancellation exists. The "You're all settled" card only fires when both ledger sides are genuinely empty.

---

### 2g. `smartSettlementPresentation.ts` — `getDisplayStrategy`

**CURRENT:**
```ts
const amount = clampCurrency(isPay ? bestStrategy.debt.amount : bestStrategy.amount);
```

Under the old code, `bestStrategy.debt.amount` (capped) and `bestStrategy.amount` (net) could differ; the `isPay` ternary was the workaround.

**NEW:**
```ts
// debt.amount === bestStrategy.amount always (INV-6 by construction)
// No ternary needed — use amount directly:
const amount = clampCurrency(bestStrategy.amount);
```

The ternary can remain as a defensive guard, but both paths are now equivalent.

**`remainingTotalOwed` calculation — update:**
```ts
// CURRENT: subtracts bestStrategy.debt.amount (capped) from totalOwed
const remainingTotalOwed = clampCurrency(isPay ? totalOwed - amount : totalOwed);

// NEW: unchanged in code, but now semantically correct because:
// totalOwed = sum of raw per-group debts
// amount    = first group's raw debt
// remainder = remaining raw debts across other groups/people
```

No code change required — the semantics are now correct by construction.

---

## 3. Exact UI Wording Changes

### 3a. `BestStrategyCard.tsx` — `buildPayStrategy` reasoning display

| Location | Current text | New text |
|---|---|---|
| Single group, one debt | `'Biggest impact on your balance'` | **No change** |
| Multi-group person, routing to Group 1 | `'Clears N groups with one action'` ← **FALSE** | `'Settle [GroupName] first — N groups total'` |
| Fully settled after action | `'You'll be fully settled after this'` | **No change** — now only fires when genuinely true |

### 3b. `BestStrategyCard.tsx` — "After this:" section for multi-group case

**Current:** "You'll still owe ₹X" (computed from `remainingTotalOwed` which excluded the net)

**New:** Add a second bullet when `item.hasReciprocal && item.crossGroupNetAmount !== null`:
```
• You'll still owe ₹[remainingTotalOwed]
• Your net with [personName] across all groups: ₹[crossGroupNetAmount]  ← NEW insight line
```

The insight line uses `crossGroupNetAmount` from `OptimizedPlanItem`. It is explicitly labeled as a cross-group net — not a payment amount.

### 3c. `SmartAssistantPanel.tsx` — Balance breakdown row for multi-group person

**Current:**
```
Balance with [Name]
2 groups · 2 balances    ← implies one combined action
₹8,000                   ← was cross-group net
```

**New:**
```
Balance with [Name]
2 groups · settle each separately
₹8,000                   ← now is raw sum of both groups' debts
```

The `isMulti` descriptor changes from `${item.debts.length} groups · ${item.debts.length} balances` to `${item.debts.length} groups · settle each separately`.

When expanded, each debt row is unchanged — group name + amount.

### 3d. `SmartAssistantPanel.tsx` — "Why this is best" explanation

**Current:**
```ts
return result.strategy.type === 'pay'
  ? `Paying ${result.personName} clears your balance fastest.`
  : ...
```

**New:** No wording change. This remains accurate — paying the largest single-group debt still clears balance fastest.

### 3e. `BestStrategyCard.tsx` — `isFullySettled` card

**Current:** `"You're all settled"` + `"No action needed right now."`

**New:** No wording change. Under Dir-2 this card only fires when genuinely true (both `youOweDebts` and `owedToYouDebts` are empty, including exact-cancellation cases which are now surfaced as open items).

---

## 4. Audit Findings Resolved by This Change

| Finding | Status | Resolution mechanism |
|---|---|---|
| **FINDING-01** (cross-group net shown as single-group settlement) | ✅ **RESOLVED** | `buildPayStrategy.amount = debt.amount` always; cap logic removed; routing amount === group debt |
| **FINDING-02** (`bestStrategy.amount` vs `debt.amount` ambiguity) | ✅ **RESOLVED** | Both fields are identical by construction; fragile dual-field dependency eliminated |
| **FINDING-03** (`owedToYouDebts` synthetic entry with wrong groupId) | ✅ **RESOLVED** | Phase 3 now emits raw per-group entries; each has its own correct `groupId` |
| **INV-6 violation** (Scenario 2 from validation) | ✅ **RESOLVED** | `BestStrategy.amount = optimizedPlan[0].debts[0].amount` — display and routing amount are the same |
| **INV-9 violation** (Dashboard ≠ Balance page amounts) | ✅ **RESOLVED** | Dashboard shows raw group debt; Balance page shows same raw group debt from same endpoint |
| **INV-10 false positive** (Scenario 4 exact cancellation) | ✅ **RESOLVED** | `netCents === 0` case surfaces both sides; `isFullySettled` correctly stays false |
| **INV-10 Scenario 10** (post-settlement "fully settled" false positive) | ✅ **RESOLVED** | After paying ₹8,500 in G1, G1 residual (₹1,500) and G2 receivable (₹1,500) both surface as open; `isFullySettled = false` |

---

## 5. Findings Intentionally Deferred

| Finding | Reason for deferral | Risk level |
|---|---|---|
| **FINDING-04** (`consolidate()` wrong arithmetic) | Only fires in a rare duplicate `(from,to)` pair from Phase 1+2 combined. Math accidentally produces correct results in normal cases. Low blast radius. Defer to a separate backend-only fix. | LOW |
| **FINDING-05** (`useSmartSettlement` refetches all groups on any invalidation) | Performance issue only, not a correctness issue. Acceptable until user group counts grow large. Defer to a performance pass. | MEDIUM (perf only) |
| **FINDING-06** (`SettleUp.tsx` `remainingAmount` stale window) | Self-heals on re-fetch. Transient display artifact only. Defer. | LOW |
| **FINDING-07** (Frontend duplicate-split check merge bug) | Backend catches this with `DUPLICATE_SPLIT_USER`. No data integrity risk. Defer. | LOW |
| **FINDING-08** (`viewsInSync` check too narrow in `Balance.tsx`) | Diagnostic gap only — does not affect data correctness. Defer to a diagnostic improvement pass. | LOW |
| **FINDING-09** (Stale `settled` actionContext in sessionStorage) | No cleanup for `settled` context if user returns in same session. Cosmetic UX issue. Defer. | LOW |
| **VAL-3 / VAL-4 dev-mode checks** | Recommended additions from Safety Contract. Schedule as a follow-up hardening task. | LOW |

---

## 6. Regression Prevention Strategy

### 6a. Invariant Assertions to Add Alongside the Fix

Add these as inline `console.error` guards in `useSmartSettlement.ts` (dev-only, gated on `import.meta.env.DEV`):

**Assert INV-6 (strategy amount = debt amount):**
```ts
// After buildPayStrategy / buildCollectStrategy:
if (import.meta.env.DEV && bestStrategy) {
  if (Math.abs(bestStrategy.amount - bestStrategy.debt.amount) > 0.01) {
    console.error(
      '[INV-6 VIOLATION] BestStrategy.amount !== debt.amount',
      { amount: bestStrategy.amount, debtAmount: bestStrategy.debt.amount }
    );
  }
}
```

**Assert OptimizedPlanItem.totalAmount = sum of debts:**
```ts
// After building planMap:
if (import.meta.env.DEV) {
  for (const item of planMap.values()) {
    const debtSum = item.debts.reduce((s, d) => s + Math.round(d.amount * 100), 0);
    const total = Math.round(item.totalAmount * 100);
    if (Math.abs(debtSum - total) > 1) {
      console.error('[INV-6 VIOLATION] planItem debts sum !== totalAmount', item);
    }
  }
}
```

**Assert no capped amounts remain (cap logic removal verification):**
```ts
// Verify no debt.amount in youOweDebts exceeds the raw group amount
// (This would indicate the cap logic was accidentally re-introduced)
// This assertion requires no extra data — simply log the values:
if (import.meta.env.DEV) {
  for (const d of youOweDebts) {
    if (d.amount <= 0) {
      console.error('[DATA] youOweDebts contains zero/negative amount', d);
    }
  }
}
```

---

### 6b. Scenarios That Must Be Manually Verified After Implementation

| Scenario | What to verify | Pass condition |
|---|---|---|
| **S1**: Single group debt only | Dashboard "Pay ₹X", SettleUp pre-fills same ₹X | `displayed = routed = group debt` |
| **S2**: Two groups, same direction | Dashboard shows TWO plan items (A: G1 debt, A: G2 debt listed separately) OR one plan item with `totalAmount = G1 + G2`; "Pay now" routes G1's exact amount | `routed = G1 debt amount, not combined total` |
| **S3**: Cross-group reciprocal | Dashboard: "Pay ₹10,000 to A (Group 1)"; insight annotation: "net with A across groups: ₹8,500"; SettleUp pre-fills ₹10,000 | `routed = 10000, not 8500` |
| **S4**: Exact cancellation | Dashboard surfaces BOTH G1 debt AND G2 receivable; `isFullySettled = false`; no "You're all settled" card | `both sides visible` |
| **S9**: Balance page consistency | Dashboard amount for G1 debt === Balance page G1 simplified debt amount | `dashboard = balance page` |
| **S10**: Post-settlement state | After paying G1 ₹10,000, Dashboard shows G1 residual (₹0) + G2 ₹1,500 receivable; no "fully settled" | `isFullySettled = false` |
| **Existing**: Manual SettleUp | Navigate to `/settle-up` directly; all flows unchanged | No regression |
| **Existing**: GroupCard quick-pay | GroupCard still routes `topSuggestion.amount` (single-group, unchanged) | No regression |
| **Existing**: `isFullySettled = true` | User with zero debts and zero receivables sees "You're all settled" | Correct positive case |

---

### 6c. Files That Must NOT Change

These files are confirmed safe and must not be touched:

- `src/hooks/useGroupBalance.ts` — single-group scoped, correct
- `src/pages/Balance.tsx` — single-group scoped, correct
- `src/pages/SettleUp.tsx` — reads directly from `/groups/:id/balances`, no hook dependency
- `src/pages/Dashboard.tsx` — `handleSettleAction` uses `d.groupId` and `d.amount` which will be correct after hook fix
- `src/lib/actionContext.ts` — route state shape unchanged
- `src/lib/invalidate.ts` — invalidation bus unchanged
- `Smart Backend/**` — no backend changes required

---

### 6d. Data Flow After Fix (updated)

```
/groups/:id/balances → simplifiedDebts (per group, raw amounts)
         │
         ▼ (per group, in parallel)
useSmartSettlement
  Phase 1: collect raw per-group debts keyed by personId
  Phase 2: compute netCentsByPerson (insight only, not used for amounts)
  Phase 3: classify into youOweDebts / owedToYouDebts
           - netCents < 0  → all youOwe entries added (raw amounts)
           - netCents > 0  → all owedToYou entries added (raw amounts)
           - netCents === 0 → BOTH sides added (raw amounts, INV-9 fix)
  Phase 4: build planMap
           - totalAmount = Σ raw per-group debt amounts
           - crossGroupNetAmount = netCents (display insight only)
           - NO cap logic
  buildPayStrategy:
           - debt = debts[0] (raw, uncapped)
           - amount = debt.amount (=== totalAmount for single-group person)
           - amount = debts[0].amount (first group to settle for multi-group person)
         │
         ▼
Dashboard.handleSettleAction(d: EnrichedDebt)
  d.groupId  = exact group to route to ✅
  d.amount   = exact group debt amount ✅

         ▼
SettleUpRouteState { groupId, amount: d.amount.toFixed(2) }
  → SettleUp.tsx reads /groups/:groupId/balances
  → fillFromDebt button shows same amount ✅ (no discrepancy)
  → backend validates: amount ≤ simplifiedDebt.amount ✅
```

---

## Summary: What Changes, What Stays

| | Before Dir-2 | After Dir-2 |
|---|---|---|
| `BestStrategy.amount` | Cross-group net (may not match group debt) | Raw group debt (always equals `debt.amount`) |
| `OptimizedPlanItem.totalAmount` | Cross-group net | Sum of raw per-group amounts |
| Cap logic | Present (lines 200–213) | **Removed** |
| Exact cancellation case | Hidden (omitted from both lists) | **Surfaced** (both sides shown) |
| `owedToYouDebts` entries | One synthetic entry per person (wrong amount/groupId) | One entry per group per person (correct) |
| SettleUp pre-fill | Net amount (may differ from Balance page) | Raw group debt (matches Balance page) |
| INV-6 | Violated by construction in Sc-2 | Satisfied by construction |
| INV-9 | Violated in Sc-4, Sc-9, Sc-10 | Satisfied |
| INV-10 | False positive in Sc-4, Sc-10 | Correct |
| Backend | Unchanged | Unchanged |
