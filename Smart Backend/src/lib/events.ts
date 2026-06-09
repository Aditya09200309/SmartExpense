import { EventEmitter } from 'events'
import { ExpenseAddedEvent, SettlementRecordedEvent } from './events.types'

// Type-safe event map
export interface AppEvents {
  ExpenseAdded: (event: ExpenseAddedEvent) => void
  SettlementRecorded: (event: SettlementRecordedEvent) => void
}

class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof AppEvents>(eventName: K, ...args: Parameters<AppEvents[K]>): boolean {
    return super.emit(eventName, ...args)
  }

  on<K extends keyof AppEvents>(eventName: K, listener: AppEvents[K]): this {
    return super.on(eventName, listener)
  }
}

export const eventEmitter = new TypedEventEmitter()
