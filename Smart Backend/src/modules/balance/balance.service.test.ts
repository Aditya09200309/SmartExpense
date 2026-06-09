import { describe, it, expect } from 'vitest'
import { simplifyDebts } from './balance.service'

type UserMap = Map<string, { id: string; name: string; email: string }>

function makeUsers(ids: string[]): UserMap {
  return new Map(ids.map(id => [id, { id, name: `User_${id}`, email: `${id}@test.com` }]))
}

/**
 * Applies a result set back against the starting balances and asserts that
 * every balance reaches exactly zero.  Catches any algorithm bug that moves
 * money in the wrong direction or loses/creates value.
 */
function assertAllCleared(
  startCents: Map<string, number>,
  result: ReturnType<typeof simplifyDebts>,
) {
  const settled = new Map(startCents)
  for (const d of result) {
    const transfer = Math.round(d.amount * 100)
    settled.set(d.fromUserId, (settled.get(d.fromUserId) ?? 0) + transfer)
    settled.set(d.toUserId, (settled.get(d.toUserId) ?? 0) - transfer)
  }
  for (const [id, remaining] of settled) {
    expect(remaining, `balance for ${id} not cleared`).toBe(0)
  }
}

// ─── Existing correctness suite ───────────────────────────────────────────────

describe('simplifyDebts', () => {
  it('returns empty array when all balances are zero', () => {
    const bal = new Map([['a', 0], ['b', 0]])
    expect(simplifyDebts(bal, makeUsers(['a', 'b']))).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(simplifyDebts(new Map(), new Map())).toEqual([])
  })

  it('handles a simple two-person debt', () => {
    // b owes a ₹10.00 → 1000 cents
    const bal = new Map([['a', 1000], ['b', -1000]])
    const result = simplifyDebts(bal, makeUsers(['a', 'b']))
    expect(result).toHaveLength(1)
    expect(result[0].fromUserId).toBe('b')
    expect(result[0].toUserId).toBe('a')
    expect(result[0].amount).toBeCloseTo(10)
  })

  it('consolidates multiple debtors paying one creditor', () => {
    // a is owed ₹20, b and c each owe ₹10
    const bal = new Map([['a', 2000], ['b', -1000], ['c', -1000]])
    const result = simplifyDebts(bal, makeUsers(['a', 'b', 'c']))
    expect(result).toHaveLength(2)
    const total = result.reduce((s, d) => s + d.amount, 0)
    expect(total).toBeCloseTo(20)
    result.forEach(d => expect(d.toUserId).toBe('a'))
  })

  it('produces at most n-1 transactions for n people', () => {
    // 4 people, so at most 3 transactions
    const bal = new Map([
      ['a',  3000],
      ['b',  1000],
      ['c', -2000],
      ['d', -2000],
    ])
    const result = simplifyDebts(bal, makeUsers(['a', 'b', 'c', 'd']))
    expect(result.length).toBeLessThanOrEqual(3)
    // net flow must equal total owed
    const totalFlow = result.reduce((s, d) => s + Math.round(d.amount * 100), 0)
    expect(totalFlow).toBe(4000)
  })

  it('all debtors point to creditors (never creditor → debtor)', () => {
    const bal = new Map([['rich', 5000], ['poor1', -3000], ['poor2', -2000]])
    const result = simplifyDebts(bal, makeUsers(['rich', 'poor1', 'poor2']))
    result.forEach(d => {
      expect(d.fromUserId).not.toBe('rich')
      expect(d.toUserId).toBe('rich')
    })
  })

  it('returns fractional amounts accurately', () => {
    // 33 cents each
    const bal = new Map([['a', 100], ['b', -33], ['c', -33], ['d', -34]])
    const result = simplifyDebts(bal, makeUsers(['a', 'b', 'c', 'd']))
    const total = result.reduce((s, d) => s + Math.round(d.amount * 100), 0)
    expect(total).toBe(100)
  })
})

// ─── Scenario validation suite ────────────────────────────────────────────────
//
// Validates that the algorithm handles the real-world patterns the product
// supports: chains, partial cancellations, cross-payments, and post-settlement
// recalculation.  All scenarios assert both correctness (balances clear to zero)
// and optimality (transaction count ≤ n−1).

describe('simplifyDebts – real-world scenarios', () => {

  it('chain elimination: A owes B, B owes C → single A→C payment', () => {
    // Expense 1: B paid, A owes B ₹1000.
    // Expense 2: C paid, B owes C ₹1000.
    // Net: A=-1000, B=0 (offsets cancel), C=+1000 → A→C ₹1000 only.
    const bal = new Map([['A', -1000], ['B', 0], ['C', 1000]])
    const result = simplifyDebts(bal, makeUsers(['A', 'B', 'C']))

    expect(result).toHaveLength(1)
    expect(result[0].fromUserId).toBe('A')
    expect(result[0].toUserId).toBe('C')
    expect(result[0].amount).toBeCloseTo(10)
    assertAllCleared(bal, result)
  })

  it('partial cancellation: mutual debts reduce to one net payment', () => {
    // A owes B ₹1000 and B owes A ₹600 → A should pay B ₹400 net.
    const bal = new Map([['A', -400], ['B', 400]])
    const result = simplifyDebts(bal, makeUsers(['A', 'B']))

    expect(result).toHaveLength(1)
    expect(result[0].fromUserId).toBe('A')
    expect(result[0].toUserId).toBe('B')
    expect(result[0].amount).toBeCloseTo(4)
    assertAllCleared(bal, result)
  })

  it('multiple debtors to same creditor: each debtor settles once', () => {
    // A is owed ₹20; B and C each owe ₹10.  Both B→A and C→A are correct
    // and necessary — they cannot be collapsed into one transaction because
    // B and C are separate people.
    const bal = new Map([['A', 2000], ['B', -1000], ['C', -1000]])
    const result = simplifyDebts(bal, makeUsers(['A', 'B', 'C']))

    expect(result).toHaveLength(2)
    result.forEach(d => expect(d.toUserId).toBe('A'))
    assertAllCleared(bal, result)
    // Each debtor makes exactly one outgoing payment.
    const fromCounts = result.reduce<Record<string, number>>((acc, d) => {
      acc[d.fromUserId] = (acc[d.fromUserId] ?? 0) + 1
      return acc
    }, {})
    expect(fromCounts['B']).toBe(1)
    expect(fromCounts['C']).toBe(1)
  })

  it('single debtor owes multiple creditors: pays each creditor once', () => {
    // C paid ₹10 (owes nothing more), D paid ₹10.  A owes both C and D ₹10 each.
    const bal = new Map([['A', -2000], ['C', 1000], ['D', 1000]])
    const result = simplifyDebts(bal, makeUsers(['A', 'C', 'D']))

    expect(result).toHaveLength(2)
    result.forEach(d => expect(d.fromUserId).toBe('A'))
    assertAllCleared(bal, result)
  })

  it('cross-payment: three-way expenses produce minimal settlement', () => {
    // A paid for B.  B paid for C.  C paid for A.  Each owes ₹500 to someone.
    // Net is fully balanced — A=0, B=0, C=0 after the three cross-payments.
    const bal = new Map([['A', 0], ['B', 0], ['C', 0]])
    const result = simplifyDebts(bal, makeUsers(['A', 'B', 'C']))
    expect(result).toHaveLength(0)
  })

  it('cross-payment with residual: asymmetric three-person net', () => {
    // A is owed net ₹30, B is owed net ₹10, C owes net ₹40.
    const bal = new Map([['A', 3000], ['B', 1000], ['C', -4000]])
    const result = simplifyDebts(bal, makeUsers(['A', 'B', 'C']))

    expect(result.length).toBeLessThanOrEqual(2)   // n-1 = 2 for 3 people
    assertAllCleared(bal, result)
    // C should make at most 2 payments.
    const cPayments = result.filter(d => d.fromUserId === 'C')
    expect(cPayments.length).toBeLessThanOrEqual(2)
  })

  it('single-payment preference: debtor whose amount equals one creditor settles in one tx', () => {
    // A(500)=C(500) and B(300)=D(300) — both are exact matches, so each debtor
    // makes exactly one outgoing payment.  sum: -(500+300)+(500+300)=0 ✓
    const bal = new Map([['A', -500], ['B', -300], ['C', 500], ['D', 300]])
    const result = simplifyDebts(bal, makeUsers(['A', 'B', 'C', 'D']))

    expect(result).toHaveLength(2)
    assertAllCleared(bal, result)
    expect(result.find(d => d.fromUserId === 'A')?.toUserId).toBe('C')
    expect(result.find(d => d.fromUserId === 'B')?.toUserId).toBe('D')
  })

  it('after settlement: remaining balance is re-simplified correctly', () => {
    // A owes B ₹2000.  A has already paid B ₹1000 (recorded as a settlement,
    // which the caller applies to the balance before invoking simplifyDebts).
    // Remaining net: A=-1000, B=+1000.
    const bal = new Map([['A', -1000], ['B', 1000]])
    const result = simplifyDebts(bal, makeUsers(['A', 'B']))

    expect(result).toHaveLength(1)
    expect(result[0].fromUserId).toBe('A')
    expect(result[0].toUserId).toBe('B')
    expect(result[0].amount).toBeCloseTo(10)
    assertAllCleared(bal, result)
  })

  it('no duplicate (from,to) entries in output', () => {
    const bal = new Map([
      ['A', 3000], ['B', 1000], ['C', -2000], ['D', -2000],
    ])
    const result = simplifyDebts(bal, makeUsers(['A', 'B', 'C', 'D']))
    const keys = result.map(d => `${d.fromUserId}|${d.toUserId}`)
    expect(new Set(keys).size).toBe(keys.length)
    assertAllCleared(bal, result)
  })

})

// ─── Exact-match optimisation suite ──────────────────────────────────────────
//
// The pure greedy matches the largest debtor to the largest creditor regardless
// of whether an equal-amount pair exists elsewhere.  When such a pair is missed
// it forces a later debtor to split its payment across two creditors, producing
// one extra transaction.  The exact-match pre-pass eliminates this class of
// splits before the greedy sweep runs.

describe('simplifyDebts – exact-match optimisation', () => {

  it('reduces 4 → 3 transactions when one exact pair is present (5-person case)', () => {
    //
    // Creditors : A = +600, B = +400   (total owed: 1000)
    // Debtors   : C = -300, D = -300, E = -400
    //
    // Pure greedy (largest-debtor vs largest-creditor):
    //   E(400)→A(600) : A residual 200
    //   C(300)→A(200) : A exhausted,  C residual 100
    //   C(100)→B(400) : C exhausted,  B residual 300
    //   D(300)→B(300) : done
    //   → 4 transactions
    //
    // With exact-match pass:
    //   E(400) == B(400) → E→B 400  (exact match, 1 tx)
    //   Remainder: [C:300, D:300] vs [A:600]
    //   C→A 300, D→A 300           (greedy, 2 tx)
    //   → 3 transactions  ✓
    //
    const bal = new Map([
      ['A',  600], ['B',  400],
      ['C', -300], ['D', -300], ['E', -400],
    ])
    const users = makeUsers(['A', 'B', 'C', 'D', 'E'])
    const result = simplifyDebts(bal, users)

    expect(result).toHaveLength(3)
    assertAllCleared(bal, result)
  })

  it('reduces 4 → 3 transactions when one exact pair is present (different amounts)', () => {
    //
    // Creditors : A = +700, B = +300   (total: 1000)
    // Debtors   : C = -500, D = -300, E = -200
    //
    // Pure greedy:
    //   C(500)→A(700) : A residual 200
    //   D(300)→A(200) : A exhausted,  D residual 100
    //   D(100)→B(300) : D exhausted,  B residual 200
    //   E(200)→B(200) : done
    //   → 4 transactions
    //
    // With exact-match pass:
    //   D(300) == B(300) → D→B 300
    //   Remainder: [C:500, E:200] vs [A:700]
    //   C→A 500, E→A 200
    //   → 3 transactions  ✓
    //
    const bal = new Map([
      ['A',  700], ['B',  300],
      ['C', -500], ['D', -300], ['E', -200],
    ])
    const users = makeUsers(['A', 'B', 'C', 'D', 'E'])
    const result = simplifyDebts(bal, users)

    expect(result).toHaveLength(3)
    assertAllCleared(bal, result)
  })

  it('resolves all-exact-match scenario with minimum transactions', () => {
    //
    // Every debtor has a mirror creditor: 2 debtors × 2 creditors.
    // Both algorithms produce 2 transactions, but here we verify that the
    // exact-match pass does not accidentally merge or inflate them.
    //
    const bal = new Map([
      ['A',  500], ['B',  300],
      ['C', -500], ['D', -300],
    ])
    const users = makeUsers(['A', 'B', 'C', 'D'])
    const result = simplifyDebts(bal, users)

    expect(result).toHaveLength(2)
    assertAllCleared(bal, result)
    // Each transaction is a clean one-to-one payment (no partial amounts).
    expect(result.map(r => Math.round(r.amount * 100)).sort()).toEqual([300, 500])
  })

  it('handles two creditors with the same amount independently', () => {
    //
    // Two creditors share the same amount; two debtors mirror them.
    // The bucket must not double-match a single creditor.
    //
    const bal = new Map([
      ['A',  400], ['B',  400],
      ['C', -400], ['D', -400],
    ])
    const users = makeUsers(['A', 'B', 'C', 'D'])
    const result = simplifyDebts(bal, users)

    expect(result).toHaveLength(2)
    assertAllCleared(bal, result)
    result.forEach(r => expect(Math.round(r.amount * 100)).toBe(400))
  })

  it('falls back to pure greedy when no exact pairs exist', () => {
    //
    // No debtor amount equals any creditor amount, so the exact-match pass
    // produces nothing and the greedy handles everything.
    // This is a regression check: output must still be correct.
    //
    const bal = new Map([
      ['A',  5000],
      ['B', -3000], ['C', -2000],
    ])
    const users = makeUsers(['A', 'B', 'C'])
    const result = simplifyDebts(bal, users)

    // 2 transactions, both payable to A (the only creditor)
    expect(result).toHaveLength(2)
    result.forEach(d => expect(d.toUserId).toBe('A'))
    assertAllCleared(bal, result)
  })

  it('mixed: some exact matches plus a greedy remainder', () => {
    //
    // Creditors : A = +900, B = +200, C = +100
    // Debtors   : D = -600, E = -200, F = -400
    //
    // Exact matches: E(200)==B(200) → E→B 200
    //                F(400) — no match; C(100) — no match among debtors
    // Remainder creditors: A(900), C(100)
    // Remainder debtors:   D(600), F(400)
    //
    // Greedy on remainder [D:600, F:400] vs [A:900, C:100]:
    //   D(600)→A(900): A residual 300
    //   F(400)→A(300): A exhausted, F residual 100
    //   F(100)→C(100): done
    //   → 3 greedy txs + 1 exact = 4 total
    //
    const bal = new Map([
      ['A',  900], ['B',  200], ['C',  100],
      ['D', -600], ['E', -200], ['F', -400],
    ])
    const users = makeUsers(['A', 'B', 'C', 'D', 'E', 'F'])
    const result = simplifyDebts(bal, users)

    // n-1 = 5 is the theoretical upper bound; exact-match gives us 4.
    expect(result.length).toBeLessThanOrEqual(4)
    assertAllCleared(bal, result)
  })

  it('result transaction count is never worse than pure greedy', () => {
    //
    // Stress-check: for a variety of balance configurations, the two-phase
    // algorithm must produce ≤ as many transactions as the pure greedy would.
    // We simulate the pure greedy inline for comparison.
    //
    function pureGreedy(balanceCents: Map<string, number>) {
      const d: Array<{ cents: number }> = []
      const c: Array<{ cents: number }> = []
      for (const [, v] of balanceCents) {
        if (v < 0) d.push({ cents: -v })
        else if (v > 0) c.push({ cents: v })
      }
      d.sort((a, b) => b.cents - a.cents)
      c.sort((a, b) => b.cents - a.cents)
      let count = 0, di = 0, ci = 0
      while (di < d.length && ci < c.length) {
        const t = Math.min(d[di].cents, c[ci].cents)
        d[di].cents -= t
        c[ci].cents -= t
        count++
        if (d[di].cents === 0) di++
        if (c[ci].cents === 0) ci++
      }
      return count
    }

    const cases: Array<Map<string, number>> = [
      new Map([['a', 600], ['b', 400], ['c', -300], ['d', -300], ['e', -400]]),
      new Map([['a', 700], ['b', 300], ['c', -500], ['d', -300], ['e', -200]]),
      new Map([['a', 1000], ['b', -400], ['c', -300], ['d', -300]]),
      new Map([['a', 800], ['b', 400], ['c', 200], ['d', -800], ['e', -400], ['f', -200]]),
      new Map([['a', 500], ['b', -500]]),
    ]

    for (const bal of cases) {
      const ids = [...bal.keys()]
      const result = simplifyDebts(bal, makeUsers(ids))
      const greedyCount = pureGreedy(new Map(bal))
      expect(
        result.length,
        `got ${result.length} but pure greedy would give ${greedyCount}`,
      ).toBeLessThanOrEqual(greedyCount)
      assertAllCleared(bal, result)
    }
  })
})
