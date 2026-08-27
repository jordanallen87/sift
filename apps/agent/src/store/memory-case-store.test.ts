import { MemoryCaseStore } from './memory-case-store.js';
import { runCaseStoreContractTests } from '../fixtures/case-store-contract.js';

runCaseStoreContractTests(() => new MemoryCaseStore());
