# Pre-Code Validation — Smart Expense Fix Analysis

> **Status: NO CODE WRITTEN. Validation only.**  
> Reference: System Safety Contract (INV-1–INV-10), Audit Report (FINDING-01–09).  
> Fix under consideration: Cross-group netting UX contract violation (FINDING-01 / FINDING-03).

---

## What Is Being Validated

The audit identified that `useSmartSettlement` nets cross-group debts and routes a **net amount**
(e.g. ₹8,500) to a **single-group SettleUp** (e.g. Group 1) while leaving Group 2's receivable
unaddressed. The proposed fix is validated below for correctness and regression impact.

Three fix directions from the audit:
1. **Dir-1 (Multi-step)** — route user through both groups sequentially  
2. **Dir-2 (Disable netting)** — show gross per-group amounts, require per-group settlement  
3. **Dir-3 (Disclosure)** — keep amounts, but clearly disclose that only Group 1 is settled

---

## Scenario Validation Matrix

---

### Scenario 1 — Single Group Debt Only

**Setup:** User owes Person A ₹10,000 in Group 1. No other groups with Person A.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | "Pay ₹10,000 to Person A." `netCentsByPerson[A] = -10000_00`. `youOweDebts` = [G1 ₹10,000]. No cap applies. |
| **Settle-up amount** | ₹10,000. `groupId = Group 1`. |
| **Remaining balances** | Group 1 fully cleared. `isFullySettled = true` if no other debts. |
| **Invariant changes** | None. INV-6 satisfied: `debt.amount = totalAmount = 10000`. |
| **UX breaks** | None. Single-group path is already correct. |

**Fix impact:** No change to this path — fix must guard it with `item.debts.length === 1` check.  
**Regression risk:** LOW.

---

### Scenario 2 — Multiple Groups, Same Direction Debt

**Setup:** User owes Person A ₹5,000 in Group 1 AND ₹3,000 in Group 2. No reciprocal debt.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | `netCentsByPerson[A] = -8000_00`. `youOweDebts` = [G1 ₹5,000, G2 ₹3,000]. Cap unchanged (no reciprocal). `totalAmount = 8000`. BestStrategyCard: "Pay ₹8,000 · Clears 2 groups with one action." |
| **Settle-up amount** | Dashboard routes `groupId = G1, amount = ₹5,000` (`debt.amount` of first debt). **`BestStrategy.amount = 8000` but only G1 is routed.** |
| **Remaining balances** | After paying ₹5,000: G1 cleared. G2 ₹3,000 remains. User must notice and settle G2 manually. |
| **Invariant changes** | ⚠️ **INV-6 VIOLATED**: displayed ₹8,000, routed ₹5,000. The cap logic does not reduce this case (no reciprocal debt to absorb). |
| **UX breaks** | ⚠️ YES — "Clears 2 groups with one action" is false. Only 1 group is settled. |

> [!CAUTION]
> This is the most common multi-group scenario. The INV-6 violation is unconditional here — the cap logic only helps when there IS a reciprocal cross-group debt, not when debts are same-direction.

**Regression risk:** HIGH — most affected by fix direction choice.

---

### Scenario 3 — Cross-Group Reciprocal Debt

**Setup:** User owes Person A ₹10,000 in Group 1. Person A owes User ₹1,500 in Group 2.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | `netCentsByPerson[A] = -8500_00`. Cap: G1 debt reduced to ₹8,500. BestStrategyCard: "Pay ₹8,500 to Person A." |
| **Settle-up amount** | SettleUp pre-fills `groupId = G1, amount = ₹8,500`. Backend G1 debt = ₹10,000. ₹8,500 ≤ ₹10,000 → ALLOWED. |
| **Remaining balances** | G1 residual = ₹1,500. G2 receivable = ₹1,500 (untouched). Net economic = 0. Two live ledger items. |
| **Invariant changes** | `reasoning = "You'll be fully settled after this"` does NOT fire (owedToYouDebts has G2 entry). ✅ But the user leaves with two open ₹1,500 items they believe are net-zero. |
| **UX breaks** | ⚠️ PARTIAL — User expected paying ₹8,500 resolves the relationship. It does not. G2 collection is a separate manual step. |

**Regression risk:** HIGH — this is the root of FINDING-01.

---

### Scenario 4 — Exact Cancellation Across Groups

**Setup:** User owes Person A ₹5,000 in Group 1. Person A owes User ₹5,000 in Group 2.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | `netCentsByPerson[A] = 0`. Phase 3 omits Person A from both lists. Dashboard: "You're all settled!" if no other debts. |
| **Settle-up amount** | N/A — no action shown for Person A. |
| **Remaining balances** | Dashboard: ₹0 net. **Balance page G1: ₹5,000 outstanding. Balance page G2: ₹5,000 receivable.** Two real ledger entries exist. |
| **Invariant changes** | ⚠️ **INV-9 VIOLATED**: Dashboard says resolved. Balance page shows ₹5,000. These directly contradict. |
| **UX breaks** | ⚠️ YES — User checks Balance page, panics, manually submits ₹5,000 settlement in G1. Post-settlement: G1 cleared, G2 ₹5,000 receivable now has no offset → Dashboard shows `owedToYouDebts = [G2 ₹5,000]`. |

> [!WARNING]
> Exact cancellation is the hardest case. Surfacing both debts is confusing; hiding them produces INV-9 violation. The fix must explicitly choose a behavior and document the trade-off.

**Regression risk:** MEDIUM — depends on whether Phase 3 omission logic is changed.

---

### Scenario 5 — Partial Cancellation Across Groups

**Setup:** User owes Person A ₹8,000 in Group 1. Person A owes User ₹3,000 in Group 2.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | `netCentsByPerson[A] = -5000_00`. Cap: G1 debt capped to ₹5,000. BestStrategy: "Pay ₹5,000." |
| **Settle-up amount** | `groupId = G1, amount = ₹5,000`. Backend G1 = ₹8,000. Allowed. |
| **Remaining balances** | G1 residual = ₹3,000. G2 receivable = ₹3,000. Net = 0. Two live items. |
| **Invariant changes** | Same as Scenario 3. INV-9 partially violated post-settlement. |
| **UX breaks** | YES — same as Scenario 3. User expects relationship resolved; ledger disagrees. |

**Regression risk:** HIGH — same fix target as Scenario 3.

---

### Scenario 6 — Multiple People Across Multiple Groups

**Setup:** User owes A ₹5,000 in G1, owes B ₹2,000 in G2. B owes User ₹1,000 in G3.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | `netCentsByPerson`: A = -5000_00, B = 1000_00 - 2000_00 = -1000_00. `youOweDebts` = [G1: A ₹5,000, G2: B ₹1,000 (capped from ₹2,000)]. BestStrategy: pay A ₹5,000. |
| **Settle-up amount** | G1, ₹5,000. |
| **Remaining balances** | A cleared. B: G2 ₹2,000 still on ledger, G3 ₹1,000 receivable still on ledger. Dashboard shows B net = ₹1,000. |
| **Invariant changes** | INV-9 partially broken for B: Balance G2 = ₹2,000, Dashboard net = ₹1,000. |
| **UX breaks** | Moderate — per-group residuals visible on Balance page differ from Dashboard summary. |

**Regression risk:** MEDIUM — fix loop over `planMap` affects all plan items.

---

### Scenario 7 — Existing Settle-Up Flow (Manual Navigation)

**Setup:** User navigates to `/settle-up` directly, manually selects Group 1, enters ₹10,000, submits.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | Irrelevant. |
| **Settle-up amount** | User-entered ₹10,000. `effectiveReceiverId` valid. Backend allows. |
| **Remaining balances** | Group 1 fully cleared. Dashboard re-fetches via invalidation bus. |
| **Invariant changes** | None. Manual flow has no dependency on `useSmartSettlement`. |
| **UX breaks** | None. |

**Fix impact:** ZERO — manual SettleUp reads directly from `/groups/:id/balances`.  
**Regression risk:** ZERO.

---

### Scenario 8 — Dashboard Quick-Pay Flow (GroupCard)

**Setup:** User clicks quick-pay on GroupCard, which routes via `useGroupBalance.topSuggestion`.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | GroupCard badge = `userNetBalance` (single-group, no netting). |
| **Settle-up amount** | `topSuggestion.amount` (single-group gross). Routes `groupId = topSuggestion.groupId`. |
| **Remaining balances** | Post-settlement: `invalidate({ resource: 'balances', groupId })` fires. `useSmartSettlement` refetches all groups and recalculates correctly. |
| **Invariant changes** | None. GroupCard uses `useGroupBalance`, untouched by fix. |
| **UX breaks** | None. Post-pay Dashboard update is driven by invalidation bus — correct behavior. |

**Fix impact:** Near-zero.  
**Regression risk:** LOW.

---

### Scenario 9 — Balance Page Consistency

**Setup:** User has G1 debt ₹10,000 to Person A. Dashboard shows "Pay ₹8,500" (cross-group net). User opens Balance page for G1.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | ₹8,500 (cross-group net). |
| **Balance page display** | `simplifiedDebts` for G1 = ₹10,000. `viewsInSync = true` (within-group boundary). |
| **Settle-up amount** | From Dashboard: ₹8,500. From Balance page "Settle" link: ₹10,000. |
| **Remaining balances** | Depends on which path used. |
| **Invariant changes** | ⚠️ **INV-9 VIOLATED**: Dashboard ₹8,500 ≠ Balance page ₹10,000 for same group+person. |
| **UX breaks** | YES — user sees two different numbers and does not know which to trust. |

**Fix impact:** Fix must decide whether to label Dashboard as "net" or suppress netting entirely.  
**Regression risk:** HIGH — changes user-facing amount on one of the two surfaces.

---

### Scenario 10 — Invalidation + Refresh Behavior

**Setup:** User settles ₹8,500 in G1 (from Dashboard). `invalidate({ resource: 'balances', groupId: G1 })` fires.

| Dimension | Expected Outcome |
|---|---|
| **Dashboard display** | `useSmartSettlement` refetches all groups. G1 residual = ₹1,500. G2 receivable = ₹1,500. `netCentsByPerson[A] = 0` → exact cancellation → omitted. Dashboard: "You're fully settled!" |
| **Settle-up amount** | N/A — Person A no longer shown. |
| **Remaining balances** | G1 Balance page: ₹1,500 outstanding. G2 Balance page: ₹1,500 receivable. Two live ledger items exist. |
| **Invariant changes** | ⚠️ **INV-9 VIOLATED**: Dashboard = "fully settled," G1 Balance page = ₹1,500 open. |
| **UX breaks** | ⚠️ CRITICAL — Dashboard says done. If user checks Balance, they find a live ₹1,500 debt they thought was resolved. |

> [!CAUTION]
> Scenario 10 is a **second-order bug**: even after a correct fix to routing, the post-settlement Dashboard state will show a false "fully settled" due to exact-cancellation omission. This must be addressed alongside the routing fix.

**Regression risk:** HIGH.

---

## Consolidated Risk Register

### Hidden Regression Risks

| Risk ID | Description | Severity | Affected Scenarios |
|---|---|---|---|
| **RR-01** | Fix changes `youOweDebts` structure → `BestStrategyCard` and `SmartAssistantPanel` may render incorrectly | HIGH | All |
| **RR-02** | `handleSettleAction(d: EnrichedDebt)` depends on `d.groupId`, `d.amount`, `d.toUserId` being valid single-group values | HIGH | 2, 3, 5 |
| **RR-03** | Dir-1 multi-step routing requires new route state shape → must not break existing `SettleUpRouteState` | HIGH | 7 |
| **RR-04** | Dir-2 changes `optimizedPlan[0].totalAmount` → all consumers of `totalAmount` must be audited | MEDIUM | 2, 3, 5 |
| **RR-05** | `reasoning: "Clears N groups with one action"` stays misleading if single-group routing is retained | MEDIUM | 2 |
| **RR-06** | `isFullySettled = youOweDebts.length === 0 && owedToYouDebts.length === 0` → exact cancellation post-settlement produces false positive | HIGH | 10 |
| **RR-07** | `owedToYouDebts` synthetic `rep` uses largest-debt group's `groupId` (FINDING-03) — fixing `youOweDebts` without fixing `owedToYouDebts` leaves collect flow broken | MEDIUM | 4 |
| **RR-08** | Stale `actionContext` in sessionStorage may re-display wrong post-settlement card if feedback structure changes | LOW | 10 |

---

### Stale State Risks

| Risk ID | Description | Severity |
|---|---|---|
| **SS-01** | `SettleUp.tsx` `remainingAmount` optimistic estimate: if pre-fill amount changes (₹8,500 → ₹10,000), estimate changes but self-heal still works | LOW |
| **SS-02** | `useSmartSettlement` refetches all groups during invalidation; if Dir-1 sequential routing is used, Group 2 SettleUp may open before Group 1 refetch completes | MEDIUM |
| **SS-03** | `actionContext` sessionStorage: after G1 settlement creates a `settled` context, returning to pay G2 leaves a stale G1 context with no cleanup | LOW |
| **SS-04** | `SettleUp.tsx` `allDebts` cleared on group change via `handleGroupChange`; Dir-1 programmatic group switch must go through the same reset path | MEDIUM |

---

### Routing Mismatch Risks

| Risk ID | Description | Severity |
|---|---|---|
| **RM-01** | If fix passes a synthetic multi-group debt to `handleSettleAction`, `d.groupId` becomes ambiguous → wrong group routed | HIGH |
| **RM-02** | `owedToYouDebts[0].groupId` = largest-debt group's ID (FINDING-03); if collect routing is not fixed, collecting cross-group receivable goes to wrong group | MEDIUM |
| **RM-03** | `SettleUp.tsx` shows `fillFromDebt` button with the actual group debt (₹10,000) alongside Dashboard pre-fill (₹8,500) — two different amounts visible simultaneously for the same person | HIGH |
| **RM-04** | `effectiveReceiverId = validReceiverIds.has(fields.receiverId)` — if fix changes `receiverId` to someone not in the group's `simplifiedDebts`, form silently falls back to empty receiver | HIGH |

---

## Fix Direction Assessment

| Direction | Scenario Coverage | INV-9 Fixed | INV-6 Fixed | RM-01 Safe | SS-02 Safe | UX Break Risk |
|---|---|---|---|---|---|---|
| **Dir-1: Multi-step routing** | Best — routes all groups | ✅ | ✅ | ✅ with new shape | ⚠️ Medium | HIGH — new UX flow |
| **Dir-2: Disable netting** | Good — per-group, matches Balance page | ✅ | ✅ | ✅ | ✅ | MEDIUM — amounts change |
| **Dir-3: Disclosure only** | Minimal — amounts unchanged | ❌ partial | ❌ | ✅ | ✅ | LOW — least disruptive |

> [!IMPORTANT]
> **Recommended pre-validation conclusion:** Dir-3 (Disclosure) is the lowest-risk starting point — it resolves the UX contract mismatch without touching calculation or routing logic. Dir-2 is the correct long-term fix (INV-6 + INV-9 both resolved). Dir-1 is most complete but carries the highest regression surface and requires new route state shapes.

---

## Invariant Impact Summary

| Invariant | Currently | After Dir-1 | After Dir-2 | After Dir-3 |
|---|---|---|---|---|
| INV-1 (net=0 per group) | ✅ | ✅ | ✅ | ✅ |
| INV-2 (simplified debts preserve net) | ✅ | ✅ | ✅ | ✅ |
| INV-3 (raw debts preserve net) | ✅ | ✅ | ✅ | ✅ |
| INV-4 (split = total) | ✅ | ✅ | ✅ | ✅ |
| INV-5 (settle ≤ debt) | ✅ | ✅ | ✅ | ✅ |
| INV-6 (strategy amount = debt amount) | ⚠️ BROKEN (Sc-2) | ✅ | ✅ | ⚠️ Still broken |
| INV-7 (group isolation) | ✅ | ✅ | ✅ | ✅ |
| INV-8 (cross-group additive only) | ✅ | ✅ | ✅ | ✅ |
| INV-9 (view consistency) | ⚠️ BROKEN | ✅ | ✅ | ⚠️ Still broken |
| INV-10 (isFullySettled) | ✅ | ⚠️ Verify Sc-10 | ✅ | ✅ |

---

## Pre-Code Decision Checklist

Lock these decisions before writing any code:

- [ ] **D-01** Which fix direction is chosen (1, 2, or 3)?
- [ ] **D-02** If Dir-1: define new multi-step route state shape; ensure backward-compat with existing `SettleUpRouteState`.
- [ ] **D-03** If Dir-2: does `optimizedPlan[0].totalAmount` become per-group gross? If yes, audit all consumers (`SmartAssistantPanel`, `BestStrategyCard`).
- [ ] **D-04** Is `owedToYouDebts` collect routing fix (FINDING-03) in scope or deferred? Document explicitly either way.
- [ ] **D-05** Is the post-settlement false "fully settled" (Sc-10 / RR-06) fixed in this change?
- [ ] **D-06** Is `consolidate()` arithmetic bug (FINDING-04) deferred? (Low severity, safe to defer.)
- [ ] **D-07** Are VAL-3 / VAL-4 dev-mode validation checks added as part of this change?
