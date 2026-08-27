import { InMemoryActivityStore } from './activity-store.js';
import { runActivityStoreContractTests } from '../fixtures/activity-store-contract.js';

runActivityStoreContractTests(() => new InMemoryActivityStore());
