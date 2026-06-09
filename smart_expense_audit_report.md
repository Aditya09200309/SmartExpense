# Smart Expense — Full Codebase Audit Report
> Scope: INV-1 through INV-10, balance calculation flow, group isolation,  
> stale state, cross-group contamination, dashboard strategy correctness.  
> **No fixes applied.** Diagnosis only.

---

## 1. Balance Calculation Flow — End-to-End Trace

### 1a. Backend (`balance.service.ts`)

```
DB Queries (parallel):
  group → existence check
  groupMember → all members + user info
  expense → paidById, amount, splits[userId, amount]
  settlement → payerId, receiverId, amount

Integer cents arithmetic:
  For each expense:
    balanceCents[paidById] += toCents(expense.amount)   ← credit the payer
    balanceCents[split.userId] -= toCents(split.amount) ← debit each split recipient

  For each settlement:
    balanceCents[payerId]   += toCents(s.amount)  ← reduces debt
    balanceCents[receiverId] -= toCents(s.amount) ← reduces credit

netBalances = fromCents() applied to each member entry
simplifiedDebts = simplifyDebts(memberBalanceCents, userMap)  ← 3-phase algorithm
rawDebts = computeRawDebts(expenses, settlements, userMap)    ← pairwise direct view
```

**Both `simplifiedDebts` and `rawDebts` are derived from the same DB snapshot inside a single `Promise.all()`. No divergence possible at the DB level.**

### 1b. Frontend Sources of Truth

| Consumer | Endpoint Called | Fields Used |
|---|---|---|
| `useGroupBalance` (GroupCard) | `/groups/:id/balances` per group | `netBalances`, `simplifiedDebts` |
| `Balance.tsx` | `/groups/:id/balances` per selected group | `netBalances`, `simplifiedDebts`, `rawDebts` |
| `useSmartSettlement` (Dashboard) | `/groups/:id/balances` for ALL groups | `simplifiedDebts` only |
| `SettleUp.tsx` | `/groups/:id/balances` per group | `simplifiedDebts` only |

**Each consumer makes its own independent HTTP fetch. There is no shared cache.**

---

## 2. Invariant Verification — INV-1 through INV-10

> The Safety Contract defined in conversation 21259776 is used as the reference.

### INV-1 — Single Source of Truth for Balance Calculation
**Status: ✅ SAFE**

All balance math lives exclusively in `balance.service.ts → getGroupBalances()`.  
No frontend component independently recalculates balances from raw expense data.  
The frontend is purely a display consumer of API responses.

---

### INV-2 — Balance = Σ(paidAmount) − Σ(splitAmount) + Σ(settlementsPaid) − Σ(settlementsReceived)
**Status: ✅ SAFE**

The formula is implemented correctly at lines 87–102 of `balance.service.ts`:
```
+expense.amount     → credit payer
-split.amount       → debit split recipients
+settlement.amount  → credit payer (reduces debt)
-settlement.amount  → debit receiver (reduces their credit)
```
The math is in integer cents to avoid floating-point drift.

---

### INV-3 — Group Isolation (no cross-group balance contamination)
**Status: ✅ SAFE (backend) / ⚠️ NEEDS SCRUTINY (frontend)**

**Backend:** Every query in `getGroupBalances` is scoped with `where: { groupId }`. There is no path for one group's data to leak into another's balance.

**Frontend concern:** `useSmartSettlement` fetches **all groups in parallel** and **merges results cross-group**. This is intentional (it's a cross-group debt summary), but the merge logic must be scrutinized:

- Phase 2 computes a **global net per person across groups** (lines 154–160, `useSmartSettlement.ts`).
- Phase 3 classifies debts based on the global net direction, not per-group direction.
- **⚠️ Edge case:** If user owes Person A ₹10000 in Group 1 and Person A owes user ₹1500 in Group 2, the net is ₹8500. The `youOweDebts` array will contain only Group 1 entries (since netCents < 0), but the displayed per-group amounts are the RAW per-group simplifiedDebts — NOT the net amounts.

This is the **root cause of the ₹8500 / ₹10000 display discrepancy** investigated in the audit request. See Section 4.

---

### INV-4 — Settlements Cannot Exceed Outstanding Debt
**Status: ✅ SAFE**

`settlement.service.ts` lines 42–60 enforce:
1. A `simplifiedDebt` from payer→receiver must exist.
2. `amountCents > debtCents` rejects with `AMOUNT_EXCEEDS_OWED`.
3. The check runs inside a **Serializable transaction**, preventing TOCTOU races.

---

### INV-5 — Split Sum Must Equal Expense Total
**Status: ✅ SAFE (backend + frontend both enforce)**

Backend: `expense.service.ts` lines 98–107 — integer cents comparison.  
Frontend: `AddExpense.tsx` lines 87–93 — same integer cents comparison in client validation.  
Backend is the authoritative enforcer; frontend is defensive.

---

### INV-6 — Only Group Members Can Appear in Splits / Settlements
**Status: ✅ SAFE**

Expense service: lines 83–89 check every `split.userId` against `memberIds`.  
Settlement service: receiver membership verified via `balances.netBalances` (line 34).  
Payer membership verified by `getGroupBalances` throwing `NOT_MEMBER`.

---

### INV-7 — `simplifiedDebts` Must Be Mathematically Equivalent to `netBalances`
**Status: ✅ SAFE (algorithm) / ⚠️ THEORETICAL RISK (floating point in consolidate())**

The `simplifyDebts` algorithm correctly derives transactions from the same `memberBalanceCents` map used for `netBalances`. The test suite (`balance.service.test.ts`) verifies all balances clear to zero.

**Minor issue found:** `consolidate()` function at line 252 does:
```ts
existing.amount = fromCents(Math.round((existing.amount + d.amount) * 100))
```
This mixes `fromCents` (divide by 100) with multiplication by 100, but `existing.amount` is already a decimal (not cents). The result is: `fromCents(Math.round(decimalA + decimalB) * 100)`. This is **incorrect** — it should be:
```ts
existing.amount = fromCents(toCents(existing.amount) + toCents(d.amount))
```
However, `consolidate()` is only triggered when Phase 1 exact-match AND Phase 2 greedy produce a duplicate `(from, to)` pair, which is an edge case unlikely in normal data. **Severity: LOW** (rarely triggered, but wrong when it fires).

---

### INV-8 — Cache Invalidation Propagates to All Mounted Consumers
**Status: ✅ SAFE (architecture) / ⚠️ INCOMPLETE COVERAGE (Dashboard strategy)**

`invalidate({ resource: 'balances', groupId })` is called after:
- `SettleUp.tsx` successful settlement → ✅
- `GroupCard.tsx` `handleItemSettle` → ✅  
- `GroupCard.tsx` `handleQuickSettle` → ✅
- `AddExpense.tsx` successful add → ✅ (but without `groupId` filter — broadcasts to all)

**Wait.** `AddExpense.tsx` line 225:
```ts
invalidate({ resource: 'balances', groupId })
```
`groupId` IS passed here. ✅

**Dashboard `useSmartSettlement` invalidation listener (line 88–92):**
```ts
useEffect(() => {
  return onInvalidate(({ resource }) => {
    if (resource === 'balances') setRefetchKey(k => k + 1);
  });
}, []);
```
This does NOT check `groupId` — any balance invalidation refetches ALL groups. This is **intentionally broad** (dashboard is cross-group) and **correct behavior**.

**`useGroupBalance` listener (lines 40–50) IS properly group-scoped** — only refetches when `changedGroupId === groupId` or no groupId specified.

**Summary: Invalidation architecture is sound.** The only gap is that `useSmartSettlement` does a full multi-group refetch on any single-group mutation, which is wasteful but not incorrect.

---

### INV-9 — Dashboard Strategy Uses Same Data as Balance Page
**Status: ⚠️ STRUCTURALLY DIVERGENT — Root cause of the ₹8500/₹10000 bug**

This is the most critical finding. See Section 4 for full analysis.

**Dashboard `bestStrategy.amount`** is derived from `item.totalAmount` (the cross-group net per person).  
**Balance page** shows per-group `simplifiedDebts[].amount`.

These are **different numbers by design** — but they are **presented as if they were the same thing** when the user navigates from Dashboard → SettleUp.

---

### INV-10 — No Stale React State After Invalidation
**Status: ✅ SAFE for most paths / ⚠️ ONE STALE STATE WINDOW**

**Stale window identified in `SettleUp.tsx`:**

At line 247:
```ts
const remainingAmount = roundCurrency(Math.max((currentDebt?.amount ?? 0) - amount, 0));
```
`currentDebt` is read from `myDebts`, which comes from `allDebts` (the pre-submission snapshot). After `api.post('/settlements', ...)` succeeds:
1. `setDebtsLoading(true)` is set (line 261).
2. `invalidate(...)` is dispatched (line 276).
3. The `onInvalidate` listener increments `debtsKey`, triggering a re-fetch.

**During the window between steps 1–3**, `settlementFeedback.remainingAmount` is computed from the stale `currentDebt.amount` (line 247). This is a **front-end optimistic estimate** that is immediately overwritten when the re-fetch completes (lines 125–135). The feedback shows "remaining = X" transiently using the estimate, then updates to the server-confirmed amount.

**This is intentional and the comment at line 247 implies awareness, but it is not guarded for race conditions.** If the server response arrives before React processes the state update, the displayed remaining amount could briefly be wrong.

**Severity: LOW** — only affects the transient feedback message, self-corrects on next render.

---

## 3. Specific Bug Analysis: ₹8500 / ₹10000 Discrepancy

### Scenario
- User owes Person A **₹10000** in Group 1 (via `simplifiedDebts`)
- Person A owes User **₹1500** in Group 2 (via `simplifiedDebts`)

### What the Dashboard Shows

**`useSmartSettlement.ts` Phase 2** (lines 154–160):
```ts
const youOweCents = 10000_00    // group 1 debt
const owedToYouCents = 1500_00  // group 2 debt
netCentsByPerson = { [PersonA.id]: 1500_00 - 10000_00 = -8500_00 }
```

**Phase 3** (lines 166–177):
```ts
// netCents < 0 → you owe them
// Keeps Group 1 entry in youOweDebts with amount = ₹10000
youOweDebts = [{ ...group1Debt, amount: 10000 }]
```

**Phase 4** (lines 183–217):
```ts
// planMap entry for PersonA:
totalAmount = Math.abs(-8500_00) / 100 = 8500   // ← NET amount

// BUT item.debts[0] still contains the GROUP-1 debt with amount = 10000
// Cap logic (lines 203–213) SHOULD reduce it:
remainingCents = 8500_00
dCents = 10000_00
take = Math.min(10000_00, 8500_00) = 8500_00
// So debt.amount is overwritten to 8500 ✅
```

**`buildPayStrategy`** (lines 222–236):
```ts
debt: item.debts[0]    // ← this is the capped debt: amount = 8500
amount: item.totalAmount  // = 8500
```

**`getDisplayStrategy`** in `smartSettlementPresentation.ts` (line 39):
```ts
const amount = clampCurrency(isPay ? bestStrategy.debt.amount : bestStrategy.amount)
//                                   ↑ bestStrategy.debt.amount = 8500 ✅
```

**`BestStrategyCard`** renders:
```
"Pay ₹8500 to PersonA"
```

**`handleSettleAction` in `Dashboard.tsx`** (lines 74–84):
```ts
const settleUpState: SettleUpRouteState = {
  groupId: d.groupId,    // ← Group 1's ID
  amount: d.amount.toFixed(2),  // ← d = bestStrategy.debt = capped to 8500
  ...
};
navigate('/settle-up', { state: settleUpState });
```

**`SettleUp.tsx` then opens with:**
- Group = Group 1
- Amount = ₹8500
- But `simplifiedDebts` for Group 1 shows ₹10000 (the group-level debt)

**Backend will REJECT** the settlement of ₹8500 because `settlement.service.ts` line 52–60:
```ts
const debtCents = Math.round(debt.amount * 100)  // = 10000_00
const amountCents = Math.round(input.amount * 100) // = 8500_00
// 8500_00 <= 10000_00 → ALLOWED ✅ (no rejection)
```

So the settlement **goes through** but only records ₹8500, leaving ₹1500 residual in Group 1.  
The Group 2 debt of ₹1500 (Person A owes User) is untouched.

**Net after settlement:** User paid ₹8500 to Person A in Group 1. Person A still owes User ₹1500 in Group 2.  
**The cross-group netting was implied but NOT executed as a single atomic action.**

### Root Cause Summary

The Dashboard shows a **cross-group net amount (₹8500)** routed to a **single group settlement**. The system implicitly presents a multi-group optimization as if it were a single-group payment. The two separate group debts are NOT automatically settled together. The user must manually record the Group 2 collection separately.

**This is not a calculation bug — it is a UX contract violation.** The Dashboard strategy card implies "do this one thing to clear the relationship" but the reality requires two separate actions in two separate groups.

---

## 4. Findings Ranked by Severity

### 🔴 CRITICAL — Severity 1

#### FINDING-01: Cross-Group Amount Presented as Single-Group Settlement
- **File:** `useSmartSettlement.ts` (Phase 3–4), `Dashboard.tsx` (handleSettleAction), `SettleUp.tsx`
- **Description:** When a user owes Person A in Group 1 and Person A owes user in Group 2, the dashboard derives a net amount (e.g., ₹8500) and routes the user to SettleUp with that net amount against Group 1 only. This implies a cross-group cancellation that the backend does NOT execute. The Group 2 receivable is never settled automatically.
- **INV violated:** INV-9 (Dashboard strategy diverges from Balance page view)
- **Effect:** User believes the relationship is settled for ₹8500 but actually needs to separately collect ₹1500 from Group 2. The displayed "fully settled after this" reasoning in `buildPayStrategy` is INCORRECT when cross-group netting applies.

---

### 🟠 HIGH — Severity 2

#### FINDING-02: `bestStrategy.amount` vs `bestStrategy.debt.amount` Ambiguity
- **File:** `smartSettlementPresentation.ts` line 39, `useSmartSettlement.ts` lines 222–235
- **Description:** `buildPayStrategy` sets `debt: item.debts[0]` (the capped group debt) and `amount: item.totalAmount` (the net). The display layer uses `bestStrategy.debt.amount` for the pay case. The cap logic ensures these are equal ONLY when netting applies. When there is no cross-group netting, `debt.amount` and `totalAmount` are the same. **But if the cap logic ever fails** (e.g., floating point edge case in `Math.round`), the displayed amount and the routed SettleUp amount would diverge silently.
- **INV violated:** INV-7, INV-9
- **Severity justification:** Currently works due to cap, but the dual amount fields create a fragile dependency.

#### FINDING-03: `owedToYouDebts` in cross-group scenario uses a single synthetic entry
- **File:** `useSmartSettlement.ts` lines 171–174
- **Description:** When multiple groups show Person A owes you, `owedToYouDebts` emits ONE synthetic entry:
  ```ts
  const rep = [...entries].sort((a, b) => b.amount - a.amount)[0];
  owedToYouDebts.push({ ...rep, amount: netCents / 100 });
  ```
  The `rep` entry's `groupId` is the group with the LARGEST individual debt — not necessarily the group where the net amount "lives." When the user clicks "Collect" → navigates to SettleUp, the groupId may refer to a group where the full net amount is NOT outstanding (because some is in another group).
- **INV violated:** INV-9
- **Effect:** SettleUp pre-fills with the wrong groupId for collecting cross-group receivables.

---

### 🟡 MEDIUM — Severity 3

#### FINDING-04: `consolidate()` Bug — Wrong Arithmetic When Deduplicating
- **File:** `balance.service.ts` lines 248–257
- **Description:**
  ```ts
  existing.amount = fromCents(Math.round((existing.amount + d.amount) * 100))
  ```
  `existing.amount` is already a decimal (e.g., 10.5). The expression `(10.5 + 5.5) * 100 = 1600`. `fromCents(1600) = 16`. **Correct answer is 16** — so the math accidentally works here. But this is wrong by construction: it works only because `fromCents = / 100` and the multiplication by 100 cancels. If the values had fractional cents (e.g., 0.333), `Math.round` would introduce rounding error. The correct form is `fromCents(toCents(existing.amount) + toCents(d.amount))`.
- **INV violated:** INV-7 (edge case)
- **Triggered by:** Phase 3 consolidation — only fires if Phase 1 exact-match AND Phase 2 greedy both produce the same `(from, to)` pair, which requires a very specific balance configuration.

#### FINDING-05: `useSmartSettlement` Refetches ALL Groups on Any Group's Invalidation
- **File:** `useSmartSettlement.ts` lines 88–92
- **Description:** The invalidation listener does NOT filter by groupId:
  ```ts
  if (resource === 'balances') setRefetchKey(k => k + 1);
  ```
  Any balance mutation (e.g., adding an expense to Group 1) triggers re-fetch of ALL groups' balances. For a user in many groups, this is N concurrent API calls.
- **INV violated:** Performance invariant (not a correctness issue)
- **Effect:** Excessive API calls after any mutation. Not a data integrity bug.

#### FINDING-06: `SettleUp.tsx` — `remainingAmount` Optimistic Estimate Before Server Confirmation
- **File:** `SettleUp.tsx` lines 246–247
- **Description:** `remainingAmount` is computed from the pre-submission `currentDebt?.amount` (stale snapshot) immediately after the POST, before the invalidation + re-fetch cycle completes. The `settlementFeedback.remainingAmount` displayed to the user is based on this estimate.
- **INV violated:** INV-10 (stale state window)
- **Self-heals:** The `useEffect` at lines 122–150 updates `settlementFeedback.remainingAmount` when `debtsLoading` returns to false. The stale display lasts only until the next fetch completes.

---

### 🟢 LOW — Severity 4

#### FINDING-07: No Duplicate Split User Check in Frontend Before API Call
- **File:** `AddExpense.tsx` lines 73–85
- **Description:** The frontend validates for duplicate `split.userId` entries. However, the check marks "every row beyond the first occurrence" using `deduplicatedRows`. If the first `splitRows` errors exist (from blank amount/userId), the `hasDuplicates` merge uses `deduplicatedRows` which may not include row errors from the original pass correctly (because `deduplicatedRows` only runs when `uid` is non-empty). The backend will catch this with `DUPLICATE_SPLIT_USER`, so it's not a data integrity issue.
- **INV violated:** None (backend is the authority)

#### FINDING-08: `Balance.tsx` viewsInSync Check Only Checks Current User
- **File:** `Balance.tsx` lines 153–155
- **Description:** The sync check compares only the current user's raw-out vs optimized-out:
  ```ts
  const myRawOut = ...filter(d => d.fromUserId === currentUser?.id)...
  const myOptOut = ...filter(d => d.fromUserId === currentUser?.id)...
  const viewsInSync = Math.abs(myRawOut - myOptOut) < 0.01;
  ```
  This does NOT verify that other members' views are in sync, nor does it verify the fundamental invariant: `Σ(simplifiedDebts) == Σ(rawDebts)` (by total flow). A user who is fully settled (no personal debts) will always see `viewsInSync = true` even if other pairs are mismatched. This is a **diagnostic gap** — the invariant check is too narrow.
- **INV violated:** None (cosmetic diagnostic tool)

#### FINDING-09: Session Storage Persistence of `actionContext` After Tab Close
- **File:** `actionContext.ts` lines 70–99
- **Description:** `readDashboardActionContext` reads from `sessionStorage` on Dashboard mount. If a user completes a settlement, navigates away, and returns in the same browser session, the stale `actionContext` will re-display the "Settled with X for Y" card even though the debt no longer exists.
- **INV violated:** Stale UX state (not a calculation bug)
- **Mitigation in place:** The `useEffect` at Dashboard lines 54–72 checks `settlement.owedToYouDebts` to auto-transition a `request-sent` context to `settled`. But there is NO equivalent cleanup for `settled` contexts — they persist until the user clicks "Show live strategy."

---

## 5. Confirmed Safe Areas

| Area | Verdict | Rationale |
|---|---|---|
| Backend balance arithmetic | ✅ SAFE | Integer cents, correct formula, full test suite |
| `simplifyDebts` algorithm | ✅ SAFE | 3-phase, tested for correctness and optimality |
| `computeRawDebts` function | ✅ SAFE | Pair-netting logic correct, member guard present |
| Group membership enforcement | ✅ SAFE | Checked in expense, settlement, and balance services |
| Settlement overpayment guard | ✅ SAFE | Serializable transaction, cents comparison |
| Split sum validation | ✅ SAFE | Both backend (authoritative) and frontend (defensive) |
| `invalidate()` bus architecture | ✅ SAFE | Clean pub/sub, correct scoping in most consumers |
| `useGroupBalance` hook | ✅ SAFE | Correctly scoped, correct field mapping |
| `Balance.tsx` data fetching | ✅ SAFE | Single-group scoped, uses all three response fields |
| `SettleUp.tsx` debt routing | ✅ SAFE (single group) | Only routes within selected group's simplifiedDebts |
| `AddExpense.tsx` form validation | ✅ SAFE | Integer cents comparison, backend re-validates |

---

## 6. Confirmed Broken Areas

| Finding | Severity | Files |
|---|---|---|
| FINDING-01: Cross-group net shown as single-group settlement | 🔴 CRITICAL | `useSmartSettlement.ts`, `Dashboard.tsx`, `SettleUp.tsx` |
| FINDING-02: Dual amount fields create fragile dependency | 🟠 HIGH | `useSmartSettlement.ts`, `smartSettlementPresentation.ts` |
| FINDING-03: `owedToYouDebts` synthetic entry uses wrong groupId for collection | 🟠 HIGH | `useSmartSettlement.ts` |
| FINDING-04: `consolidate()` wrong arithmetic (edge case) | 🟡 MEDIUM | `balance.service.ts` |
| FINDING-05: `useSmartSettlement` re-fetches all groups on any invalidation | 🟡 MEDIUM | `useSmartSettlement.ts` |
| FINDING-06: Optimistic `remainingAmount` stale window | 🟡 MEDIUM | `SettleUp.tsx` |
| FINDING-07: Frontend duplicate-split check merge bug | 🟢 LOW | `AddExpense.tsx` |
| FINDING-08: viewsInSync check too narrow | 🟢 LOW | `Balance.tsx` |
| FINDING-09: Stale `settled` actionContext persists in sessionStorage | 🟢 LOW | `actionContext.ts`, `Dashboard.tsx` |

---

## 7. Root Cause Summary for ₹8500 / ₹10000 Display Bug

**The bug is not a miscalculation — it is a conceptual mismatch between what the Dashboard promises and what a single settlement can deliver.**

The Dashboard's `useSmartSettlement` correctly nets cross-group debts to produce the most efficient payment plan. When it shows "Pay ₹8500 to Person A," it means: *if both your Group 1 debt and Person A's Group 2 debt were settled simultaneously, your net cost is ₹8500.* 

However, the actual settlement recorded is against **Group 1 only** for **₹8500** — which leaves ₹1500 unresolved in Group 1 AND ₹1500 uncollected in Group 2. The cross-group cancellation is **implied but never executed**.

The `reasoning` field in `buildPayStrategy` saying `"You'll be fully settled after this"` fires when `optimizedPlan.length === 1 && owedToYouDebts.length === 0` — but with cross-group netting, this condition is reachable while still leaving real debts in individual groups.

**Fix direction (not implementing now):** Either:
1. Multi-step flow — route user through both groups sequentially
2. Disable cross-group netting routing (show net but require per-group settlement)
3. Show clear disclosure that the action settles Group 1 only and Group 2 collection is a separate step
