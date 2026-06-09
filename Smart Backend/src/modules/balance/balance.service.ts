import prisma from '../../lib/prisma'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export interface UserNetBalance {
  userId: string
  name: string
  email: string
  netBalance: number // positive = is owed, negative = owes
}

export interface SimplifiedDebt {
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  amount: number
}

export interface RawDebt {
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  amount: number
}

export interface ActivityEvent {
  type: 'expense' | 'settlement'
  userName: string
  receiverName?: string
  description?: string
  amount: number
  date: Date
}

export interface GroupBalances {
  groupId: string
  netBalances: UserNetBalance[]
  simplifiedDebts: SimplifiedDebt[]
  rawDebts: RawDebt[]
  // Derived presentation fields
  totalExpenses: number
  totalSettled: number
  activity: ActivityEvent[]
  baseCurrency: string
}

type UserInfo = { id: string; name: string; email: string }

async function getGroupBalances(groupId: string, requesterId: string, db: Tx = prisma): Promise<GroupBalances> {
  // All four queries are independent — fetch in a single round-trip
  const [group, members, expenses, settlements] = await Promise.all([
    db.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, baseCurrency: true },
    }),
    db.groupMember.findMany({
      where: { groupId },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.expense.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      select: {
        paidById: true,
        amount: true,
        description: true,
        createdAt: true,
        currency: true,
        exchangeRate: true,
        splits: { select: { userId: true, amount: true } },
      },
    }),
    db.settlement.findMany({
      where: { groupId },
      orderBy: { settledAt: 'desc' },
      select: { payerId: true, receiverId: true, amount: true, settledAt: true },
    }),
  ])

  if (!group) {
    const err = new Error('Group not found')
    err.name = 'GROUP_NOT_FOUND'
    throw err
  }

  const memberIdSet = new Set(members.map((m) => m.userId))
  if (!memberIdSet.has(requesterId)) {
    const err = new Error('You are not a member of this group')
    err.name = 'NOT_MEMBER'
    throw err
  }

  // Work in integer cents to avoid floating-point rounding errors
  const balanceCents = new Map<string, number>()
  const userMap = new Map<string, UserInfo>()
  let totalExpenseCents = 0

  for (const m of members) {
    balanceCents.set(m.userId, 0)
    userMap.set(m.userId, m.user)
  }

  for (const expense of expenses) {
    const rate = Number(expense.exchangeRate ?? 1.0)
    const paid = toCents(Number(expense.amount) * rate)
    totalExpenseCents += paid
    balanceCents.set(expense.paidById, (balanceCents.get(expense.paidById) ?? 0) + paid)

    for (const split of expense.splits) {
      const owed = toCents(Number(split.amount) * rate)
      balanceCents.set(split.userId, (balanceCents.get(split.userId) ?? 0) - owed)
    }
  }

  for (const s of settlements) {
    const amount = toCents(s.amount)
    // Payer reduced their debt; receiver's outstanding credit shrinks
    balanceCents.set(s.payerId, (balanceCents.get(s.payerId) ?? 0) + amount)
    balanceCents.set(s.receiverId, (balanceCents.get(s.receiverId) ?? 0) - amount)
  }

  const netBalances: UserNetBalance[] = members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    netBalance: fromCents(balanceCents.get(m.userId) ?? 0),
  }))

  // Calculate total settled amount for progress bar
  // Progress = (Total Expenses) - (Total Outstanding Debts)
  // Total Outstanding = Sum of all positive net balances
  const totalOutstandingCents = netBalances
    .filter(b => b.netBalance > 0)
    .reduce((sum, b) => sum + toCents(b.netBalance), 0)
  
  const totalSettledCents = Math.max(0, totalExpenseCents - totalOutstandingCents)

  // Build derived activity history
  const activity: ActivityEvent[] = [
    ...expenses.map(e => ({
      type: 'expense' as const,
      userName: userMap.get(e.paidById)?.name ?? 'Unknown',
      description: e.description,
      amount: Number(e.amount),
      date: e.createdAt,
    })),
    ...settlements.map(s => ({
      type: 'settlement' as const,
      userName: userMap.get(s.payerId)?.name ?? 'Unknown',
      receiverName: userMap.get(s.receiverId)?.name ?? 'Unknown',
      amount: Number(s.amount),
      date: s.settledAt,
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  // Restrict simplification to current members only.
  const memberBalanceCents = new Map<string, number>()
  for (const [userId, cents] of balanceCents) {
    if (userMap.has(userId)) memberBalanceCents.set(userId, cents)
  }

  const simplifiedDebts = simplifyDebts(memberBalanceCents, userMap)
  const rawDebts = computeRawDebts(expenses, settlements, userMap)

  return { 
    groupId,
    baseCurrency: group.baseCurrency,
    netBalances, 
    simplifiedDebts, 
    rawDebts,
    totalExpenses: fromCents(totalExpenseCents),
    totalSettled: fromCents(totalSettledCents),
    activity
  }
}

// Debt simplification — three-phase algorithm.
//
// Net balances are computed before this function runs, so chains like
// A→B→C are already collapsed to A→C via the balance arithmetic.
//
// Phase 1 — exact-match pass:
//   Bucket creditors by amount. Walk debtors largest-first. When a debtor's
//   amount exactly equals a creditor's amount they settle in one transaction
//   without splitting.  Pure greedy misses these pairs, forcing a later debtor
//   to split across two creditors unnecessarily.
//
// Phase 2 — single-payment preference pass:
//   For each remaining debtor, prefer a creditor whose balance ≥ the debtor's
//   balance so the debtor can be fully settled in a single payment. Only if
//   no such creditor exists does the debtor split across multiple creditors.
//   This minimises per-debtor outgoing payments while keeping total transaction
//   count at most n−1.
//
// Phase 3 — consolidation:
//   Merge any (from, to) entries that share the same pair into one. Guards
//   against edge cases where the same pair appears from both earlier phases.
//
// All keys in balanceCents are guaranteed to exist in userMap by the caller.
export function simplifyDebts(
  balanceCents: Map<string, number>,
  userMap: Map<string, UserInfo>,
): SimplifiedDebt[] {
  const debtors: Array<{ userId: string; cents: number }> = []
  const creditors: Array<{ userId: string; cents: number }> = []

  for (const [userId, cents] of balanceCents) {
    if (cents < 0) debtors.push({ userId, cents: -cents })
    else if (cents > 0) creditors.push({ userId, cents })
  }

  if (debtors.length === 0 || creditors.length === 0) return []

  // Largest-first ordering; userId breaks ties deterministically.
  debtors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId))
  creditors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId))

  const raw: SimplifiedDebt[] = []

  // ── Phase 1: exact-match pass ──────────────────────────────────────────
  // bucket: cents → creditors with that exact amount (used as a stack).
  const creditorsByAmount = new Map<number, Array<{ userId: string; cents: number }>>()
  for (const c of creditors) {
    const bucket = creditorsByAmount.get(c.cents)
    if (bucket) bucket.push(c)
    else creditorsByAmount.set(c.cents, [c])
  }

  const unmatchedDebtors: typeof debtors = []

  for (const debtor of debtors) {
    const bucket = creditorsByAmount.get(debtor.cents)
    if (bucket?.length) {
      const creditor = bucket.pop()!
      raw.push(makeDebt(debtor.userId, creditor.userId, debtor.cents, userMap))
      if (!bucket.length) creditorsByAmount.delete(debtor.cents)
    } else {
      unmatchedDebtors.push(debtor)
    }
  }

  // Collect creditors not consumed by Phase 1.
  const unmatchedCreditors: typeof creditors = []
  for (const bucket of creditorsByAmount.values()) {
    for (const c of bucket) unmatchedCreditors.push(c)
  }

  // Re-sort so Phase 2 always sees the correct largest-first order.
  unmatchedDebtors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId))
  unmatchedCreditors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId))

  // ── Phase 2: single-payment preference + greedy sweep ─────────────────
  // For each debtor, first try to find a creditor whose balance ≥ the debtor's
  // balance so the debtor settles in one payment. Fall back to largest-creditor
  // greedy when no such creditor exists.
  for (const debtor of unmatchedDebtors) {
    while (debtor.cents > 0) {
      // Prefer a creditor that can absorb the full debtor amount (single payment).
      const singlePayIdx = unmatchedCreditors.findIndex(c => c.cents >= debtor.cents)
      const ci = singlePayIdx !== -1 ? singlePayIdx : 0  // fall back to largest creditor

      const creditor = unmatchedCreditors[ci]
      if (!creditor) break

      const transfer = Math.min(debtor.cents, creditor.cents)
      raw.push(makeDebt(debtor.userId, creditor.userId, transfer, userMap))

      debtor.cents -= transfer
      creditor.cents -= transfer

      if (creditor.cents === 0) {
        unmatchedCreditors.splice(ci, 1)
      }
    }
  }

  // ── Phase 3: consolidate duplicate (from, to) pairs ───────────────────
  return consolidate(raw)
}

function makeDebt(
  fromUserId: string,
  toUserId: string,
  cents: number,
  userMap: Map<string, UserInfo>,
): SimplifiedDebt {
  return {
    fromUserId,
    fromUserName: userMap.get(fromUserId)!.name,
    toUserId,
    toUserName: userMap.get(toUserId)!.name,
    amount: fromCents(cents),
  }
}

// Merge any transactions that share the same (from, to) pair.
function consolidate(debts: SimplifiedDebt[]): SimplifiedDebt[] {
  if (debts.length <= 1) return debts
  const merged = new Map<string, SimplifiedDebt>()
  for (const d of debts) {
    const key = `${d.fromUserId}|${d.toUserId}`
    const existing = merged.get(key)
    if (existing) {
      existing.amount = fromCents(toCents(existing.amount) + toCents(d.amount))
    } else {
      merged.set(key, { ...d })
    }
  }
  return [...merged.values()]
}

function toCents(value: unknown): number {
  return Math.round(Number(value) * 100)
}

function fromCents(cents: number): number {
  return cents / 100
}

// Computes direct pairwise obligations from expense splits and settlements —
// no cross-person routing, no chain elimination, no exact-match optimisation.
//
// Each entry shows what one person directly owes another because they were in
// that person's expense split.  Settlements reduce the corresponding pair.
// Mutual debts (A→B and B→A) are netted into a single directed entry.
//
// Invariant: for every member U,
//   sum(rawDebts where from=U) − sum(rawDebts where to=U) = U.netBalance
// Both views are derived from the same underlying state.
function computeRawDebts(
  expenses: ReadonlyArray<{
    paidById: string
    splits: ReadonlyArray<{ userId: string; amount: unknown }>
  }>,
  settlements: ReadonlyArray<{ payerId: string; receiverId: string; amount: unknown }>,
  userMap: ReadonlyMap<string, UserInfo>,
): RawDebt[] {
  // pairCents[fromId][toId] = net cents from owes to
  const pairCents = new Map<string, Map<string, number>>()

  function addCents(from: string, to: string, delta: number) {
    let row = pairCents.get(from)
    if (!row) { row = new Map(); pairCents.set(from, row) }
    row.set(to, (row.get(to) ?? 0) + delta)
  }

  for (const expense of expenses) {
    const rate = Number((expense as any).exchangeRate ?? 1.0)
    for (const split of expense.splits) {
      if (split.userId === expense.paidById) continue // payer's own share
      addCents(split.userId, expense.paidById, toCents(Number(split.amount) * rate))
    }
  }

  for (const s of settlements) {
    addCents(s.payerId, s.receiverId, -toCents(s.amount))
  }

  // Net out mutual (A→B, B→A) pairs and emit a single directed entry per pair
  const result: RawDebt[] = []
  const processed = new Set<string>()

  for (const [fromId, toMap] of pairCents) {
    for (const [toId] of toMap) {
      const fwdKey = `${fromId}|${toId}`
      const revKey = `${toId}|${fromId}`
      if (processed.has(fwdKey)) continue
      processed.add(fwdKey)
      processed.add(revKey)

      const fwd = pairCents.get(fromId)?.get(toId) ?? 0
      const rev = pairCents.get(toId)?.get(fromId) ?? 0
      const net = fwd - rev

      if (net > 0 && userMap.has(fromId) && userMap.has(toId)) {
        result.push({
          fromUserId: fromId,
          fromUserName: userMap.get(fromId)!.name,
          toUserId: toId,
          toUserName: userMap.get(toId)!.name,
          amount: fromCents(net),
        })
      } else if (net < 0 && userMap.has(fromId) && userMap.has(toId)) {
        result.push({
          fromUserId: toId,
          fromUserName: userMap.get(toId)!.name,
          toUserId: fromId,
          toUserName: userMap.get(fromId)!.name,
          amount: fromCents(-net),
        })
      }
    }
  }

  return result
}

export const balanceService = { getGroupBalances }
