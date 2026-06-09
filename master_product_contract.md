# SMART EXPENSE — MASTER PRODUCT CONTRACT
## Source of Truth | Locked | Version 1.0
> Established: 2026-05-07
> Status: LOCKED — no changes without explicit product decision

---

## 1. Core Product Purpose

Smart Expense is a **multi-group expense sharing, debt tracking, settlement optimization, relationship-aware, group-scoped** financial system.

Tracks: expenses · splits · settlements · balances · optimized settlement suggestions.

Does NOT: merge group ledgers · create synthetic settlements · mutate group truth to fit relationship netting.

---

## 2. Absolute Core Principle

> **GROUP LEDGER TRUTH IS SACRED.**

Every group is an isolated financial ledger.
Cross-group insights are: informational only · never settlement truth · never routing truth · never payment truth.

| | Example |
|---|---|
| ✅ CORRECT | "Across all groups, net with Amit = ₹8500" |
| ❌ INCORRECT | "Pay ₹8500 inside Goa Trip group where actual debt is ₹10000" |

---

## 3. Product Layers

### Layer 1 — Immutable Ledger Truth
Source: PostgreSQL · Prisma  
Truth entities: `Expense` · `Split` · `Settlement` · `Group` · `GroupMember`  
Defines: exact debts · exact receivables · exact group balances  
MUST NEVER: use synthetic netting · collapse groups · merge unrelated debts

### Layer 2 — Derived Financial Truth
Derived from ledger: simplified debts · net balances · optimized debt graphs  
May: compute optimal settlements · reduce transfer count · analyze relationship positions  
MUST preserve: per-group correctness · arithmetic integrity · ledger reversibility  
**Invariant:** Derived calculations must always reconcile back to ledger truth.

### Layer 3 — UX Strategy Layer
Purpose: help user decide what to pay/collect first; biggest impact action  
May: rank · prioritize · explain  
MUST NEVER: invent settlement amounts · override group debts · change routed payment amounts

---

## 4. Architecture Flow

```
Login → Dashboard → Create Group → Add Member → Add Expense
      → Balance View → Settle Up → Dashboard Refresh
```

### Routing Semantics
```ts
navigate('/settle-up', { state: { groupId, receiverId, amount } })
```
- `groupId` MUST be exact source group
- `amount` MUST equal actual group debt
- `receiverId` MUST belong to that debt
- NEVER: cross-group net amount · synthetic amount · capped amount · optimized relationship amount

---

## 5. Data Flow Contract

**Backend = Ultimate Truth.** Owns: balances · simplified debts · settlements · validation · arithmetic integrity.

**Frontend may:** display · organize · rank · explain · preview  
**Frontend may NOT:** rewrite balances · mutate debt semantics · fabricate routing amounts

---

## 6. Group Isolation Rule

Every query must remain scoped by `where: { groupId }`.

Cross-group analysis is allowed ONLY in: assistant recommendations · dashboard insights · optimization hints  
Cross-group analysis is NOT allowed in: settlement execution · routed amounts · debt mutation · balance source truth

---

## 7. Balance Page Contract

Balance page is canonical group truth.

```
Dashboard says:   Pay ₹10000 in Goa Trip
Balance page:     MUST show ₹10000
```

**Invariant:**
```
Dashboard displayed group debt
  = Balance page group debt
  = SettleUp routed amount
  = Backend validated amount
```

---

## 8. Settlement Contract

Settlement is ALWAYS: group-scoped · debt-scoped · exact-amount aware.

A settlement reduces: only that group debt · only that ledger relationship.

Settlement NEVER: auto-clears other groups · auto-offsets reciprocal groups · mutates unrelated balances.

---

## 9. Cross-Group Netting Rule

Cross-group netting is **DISPLAY ONLY**.

| | Example |
|---|---|
| ✅ Allowed | "Net with Amit across all groups = ₹8500" |
| ❌ Forbidden | Route ₹8500 settlement into Goa Trip when Goa Trip debt is ₹10000 |

Cross-group insights MUST NEVER: replace debt amount · replace route amount · replace backend amount.

---

## 10. Exact Cancellation Rule

If:
- Group A: you owe Amit ₹5000
- Group B: Amit owes you ₹5000

System MUST: show BOTH ledger truths  
System MUST NOT: hide both · say "fully settled"

Reason: Ledger truth still exists. Only explicit settlements clear ledgers.

---

## 11. Smart Strategy Contract

Smart recommendations are: advisory · prioritization only.

May: rank · prioritize · explain  
May NOT: alter ledger truth · merge debts · invent settlements

---

## 12. Invalidation Flow

After: expense creation · settlement · group mutation  
Invalidate: balances · dashboard summaries · assistant recommendations · optimized plans  
Never leave: partially stale debt graph · stale routed amounts

---

## 13. Invariants (Non-Negotiable)

| ID | Invariant |
|---|---|
| **INV-1** | Total system net must equal zero. |
| **INV-2** | Simplification preserves net balances. |
| **INV-3** | Raw debts preserve exact ledger truth. |
| **INV-4** | Split total must equal expense total. |
| **INV-5** | Settlement amount cannot exceed actual debt. |
| **INV-6** | Displayed settlement amount must equal routed amount. |
| **INV-7** | Groups remain isolated ledgers. |
| **INV-8** | Aggregations cannot mutate source debts. |
| **INV-9** | Dashboard and Balance page must agree. |
| **INV-10** | Fully-settled state only when ALL debts cleared. |

---

## 14. Forbidden Shortcuts

NEVER:
- synthetic debt entries
- capped debt mutation
- merged cross-group settlements
- hiding exact cancellation cases
- mutating `debt.amount` for UX convenience
- routing relationship net instead of group debt
- making Dashboard disagree with Balance page

---

## 15. Dashboard Contract

Dashboard is: recommendation surface · assistant surface · insight surface  
Dashboard is NOT: ledger source of truth  
Dashboard MUST remain: financially consistent · route-correct · balance-consistent

---

## 16. Group Card Contract

Each group card represents an isolated ledger summary.  
Quick-pay actions MUST: remain group-scoped · use exact group debt · never use cross-group netting.

---

## 17. Balance Computation Model

```
Expenses → Splits → Raw Debts → Net Balances → Simplified Debts
         → Optimized Suggestions → Dashboard UX
```

**Optimization MUST NEVER mutate earlier layers.**

---

## 18. UI Wording Rule

Wording must reflect actual behavior.

| | Example |
|---|---|
| ❌ Forbidden | "Clears 3 groups with one action" — if only 1 group is settled |
| ✅ Allowed | "3 groups total · settle separately" |

---

## 19. Engineering Philosophy

**Preferred:** structural correctness · invariant-driven design · ledger preservation · truth isolation · deterministic routing  
**Avoid:** convenience mutations · hidden arithmetic · implicit netting · UI-driven truth corruption

---

## 20. Change Management Rule

Before ANY code change, identify and validate:
1. Affected invariant(s)
2. Affected product layer
3. Affected routing semantics
4. Dashboard vs Balance page consistency
5. Settlement routing correctness
6. Group isolation
7. Post-settlement state

> **If any invariant breaks: STOP implementation.**

---

## 21. Architecture Validator Role

For every future change: **audit first → validate architecture → validate semantics → implement minimally.**

Authorized to: reject inconsistent code · reject architecture-breaking changes · reject routing violations · reject cross-group truth corruption.

Must preserve: financial integrity · ledger correctness · UX truthfulness · invariant consistency.

---

## Contract Status

**LOCKED.**  
Last validated against: DIR-2 implementation (2026-05-07).  
All INV-1 through INV-10 verified satisfied post DIR-2.
