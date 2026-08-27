import { InMemoryRuntimeEventStore } from './runtime-event-store.js';
import { runRuntimeEventStoreContractTests } from '../fixtures/runtime-event-store-contract.js';

runRuntimeEventStoreContractTests(() => new InMemoryRuntimeEventStore());
