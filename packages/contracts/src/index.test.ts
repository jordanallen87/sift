import { describe, expect, it } from 'vitest';
import * as SiftContracts from './index.js';

describe('@sift/contracts barrel', () => {
  it('re-exports at least one representative schema from every source module', () => {
    // attributes.ts
    expect(SiftContracts.AttributeValueSchema).toBeDefined();
    expect(SiftContracts.AttributeRecordSchema).toBeDefined();
    expect(SiftContracts.CaseAttributeDefinitionSchema).toBeDefined();
    // case.ts (including the re-exported Criterion from attributes.ts)
    expect(SiftContracts.CaseStateSchema).toBeDefined();
    expect(SiftContracts.CriterionSchema).toBeDefined();
    expect(SiftContracts.EntityRecordSchema).toBeDefined();
    // extensions.ts
    expect(SiftContracts.CaseExtensionSchema).toBeDefined();
    // commands.ts
    expect(SiftContracts.CommandReceiptSchema).toBeDefined();
    expect(SiftContracts.SiftToolResultSchema).toBeDefined();
    // events.ts
    expect(SiftContracts.PublicActivityEventSchema).toBeDefined();
    expect(SiftContracts.CaseEventSchema).toBeDefined();
    // packs.ts
    expect(SiftContracts.DecisionPackManifestSchema).toBeDefined();
    expect(SiftContracts.CompiledDecisionPackSchema).toBeDefined();
    // runtime.ts
    expect(SiftContracts.ExecutionRequestSchema).toBeDefined();
    expect(SiftContracts.RuntimeDebugEventSchema).toBeDefined();
    // scenario.ts
    expect(SiftContracts.DemoScenarioSchema).toBeDefined();
    // http.ts
    expect(SiftContracts.HttpConflictResponseSchema).toBeDefined();
  });

  it('the re-exported CriterionSchema is the identical binding from attributes.ts and case.ts', async () => {
    const attributes = await import('./attributes.js');
    const caseModule = await import('./case.js');
    expect(SiftContracts.CriterionSchema).toBe(attributes.CriterionSchema);
    expect(SiftContracts.CriterionSchema).toBe(caseModule.CriterionSchema);
  });
});
