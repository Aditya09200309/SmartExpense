export interface EventBase {
  type: string
  version: string
  timestamp: number
}

export interface SplitSnapshot {
  userId: string
  amount: number
}

// Immutable snapshot of an expense
export interface ExpenseAddedEvent extends EventBase {
  type: 'ExpenseAdded'
  version: '1.0'
  data: {
    expenseId: string
    groupId: string
    paidById: string
    amount: number
    splits: SplitSnapshot[]
  }
}

// Immutable snapshot of a settlement
export interface SettlementRecordedEvent extends EventBase {
  type: 'SettlementRecorded'
  version: '1.0'
  data: {
    settlementId: string
    groupId: string
    payerId: string
    receiverId: string
    amount: number
  }
}
