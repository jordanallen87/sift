import { describe, expect, it } from 'vitest';
import * as PaxContracts from './index.js';

describe('@pax/contracts barrel', () => {
  it('re-exports at least one representative schema from every source module', () => {
    // attributes.ts
    expect(PaxContracts.AttributeValueSchema).toBeDefined();
    expect(PaxContracts.AttributeRecordSchema).toBeDefined();
    expect(PaxContracts.CaseAttributeDefinitionSchema).toBeDefined();
    // case.ts (including the re-exported Criterion from attributes.ts)
    expect(PaxContracts.CaseStateSchema).toBeDefined();
    expect(PaxContracts.CriterionSchema).toBeDefined();
    expect(PaxContracts.EntityRecordSchema).toBeDefined();
    // extensions.ts
    expect(PaxContracts.CaseExtensionSchema).toBeDefined();
    // commands.ts
    expect(PaxContracts.CommandReceiptSchema).toBeDefined();
    expect(PaxContracts.PaxToolResultSchema).toBeDefined();
    // events.ts
    expect(PaxContracts.PublicActivityEventSchema).toBeDefined();
    expect(PaxContracts.CaseEventSchema).toBeDefined();
    // packs.ts
    expect(PaxContracts.DecisionPackManifestSchema).toBeDefined();
    expect(PaxContracts.CompiledDecisionPackSchema).toBeDefined();
    // runtime.ts
    expect(PaxContracts.ExecutionRequestSchema).toBeDefined();
    expect(PaxContracts.RuntimeDebugEventSchema).toBeDefined();
    // scenario.ts
    expect(PaxContracts.DemoScenarioSchema).toBeDefined();
    // http.ts
    expect(PaxContracts.HttpConflictResponseSchema).toBeDefined();
  });

  it('the re-exported CriterionSchema is the identical binding from attributes.ts and case.ts', async () => {
    const attributes = await import('./attributes.js');
    const caseModule = await import('./case.js');
    expect(PaxContracts.CriterionSchema).toBe(attributes.CriterionSchema);
    expect(PaxContracts.CriterionSchema).toBe(caseModule.CriterionSchema);
  });
});
