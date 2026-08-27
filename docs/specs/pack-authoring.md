# Decision Pack Authoring and Adaptability Specification

## Purpose

A **Pax Decision Pack** is the versioned, installable definition of one class of decision. **Choose Our Next Car** and **Home Energy Guardian** are Decision Packs. A pack supplies defaults, evidence rules, capability boundaries, orchestration, and presentation vocabulary; it does not enumerate every fact or preference a person may ever care about.

The authoring system must make Pax extensible without allowing a model-generated manifest to become executable, weaken human authority, or silently reinterpret an existing case.

## Canonical vocabulary

| Concept | Meaning | Example |
| --- | --- | --- |
| Pax engine | Stable event, evidence, readiness, policy, persistence, and streaming runtime | `packages/core` |
| Decision Pack | Versioned bundle for a class of decision | `car-purchase@1.0.0` |
| Pack manifest | Declarative source contract compiled into an installed pack | `pack.json` |
| Case | One durable use of one pinned compiled pack | A household's current car comparison |
| Run | One bounded execution attempt within a case | Investigate deal normalization |
| Specialist Agent | A bounded Strands agent assigned domain work | `deal-analyst` |
| Skill | Progressively disclosed instructions for a technique | `ownership-cost` |
| Tool | Registered executable capability with validated input and output | `ownership-calculator` |
| Orchestration strategy | How permitted agents coordinate | Graph or bounded Swarm |
| Case extension | A typed concern, attribute, or question added for one case | `Two dog crates must fit` |

The product and code use **Decision Pack** or **Pack**. `Playbook` is not a separate runtime entity in this release. Existing source inspiration may use that term, but public APIs, UI copy, events, and new implementation names use `packId` and `packVersion`.

## Three-layer adaptability model

Pax separates what is fixed from what may adapt:

| Layer | Owns | May the runtime model change it? |
| --- | --- | --- |
| Engine | Event rules, evidence semantics, authority, persistence, streaming, redaction | No |
| Compiled Decision Pack | Required obligations, capability allowlists, orchestration bounds, policies, default UI vocabulary | No within a case |
| Case and run plan | User criteria, case extensions, priorities, hypotheses, selected allowed skills/tools/specialists, handoffs | Yes, through validated proposals |

The model may formulate hypotheses, select an allowed capability, propose a new case concern, request a handoff, and revise its plan. It may not invent a tool, remove a required obligation, lower evidence thresholds, change human approval rules, publish a pack, or approve its own recommendation.

## Typed core with extensible domain data

Zod remains mandatory at external, persisted, tool, model-output, and event boundaries. The core schema is intentionally open at the domain layer: it validates a typed attribute protocol rather than a closed object containing every possible concern.

### Stable entity envelope

```ts
interface EntityRecord {
  id: string
  kind: string
  label: string
  attributes: Record<string, AttributeRecord>
  createdAt: string
  updatedAt: string
}

interface AttributeRecord {
  definitionId: string
  label: string
  value?: AttributeValue
  origin: 'pack' | 'user' | 'agent_proposed'
  sourceIds: string[]
  confidence?: number
  status: 'asserted' | 'supported' | 'verified' | 'conflicted' | 'unknown'
  updatedAt: string
}

type AttributeValue =
  | { type: 'string'; value: string }
  | { type: 'text'; value: string }
  | { type: 'number'; value: number; unit?: string }
  | { type: 'money'; amount: number; currency: string; cadence?: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'duration'; amount: number; unit: 'minute' | 'hour' | 'day' | 'month' | 'year' }
  | { type: 'enum'; value: string; allowedValues?: string[] }
  | { type: 'range'; minimum?: number; maximum?: number; unit?: string }
  | { type: 'string_list'; values: string[] }
```

Every variant has its own Zod schema. Arbitrary functions, class instances, recursive unbounded JSON, HTML, and executable expressions are rejected.

`value` is required for `asserted`, `supported`, `verified`, and `conflicted` records and must be absent for `unknown`. This cross-field rule prevents fake empty strings or zeroes from standing in for missing evidence.

### Pack-defined attributes

A pack declares common fields as data:

```ts
interface AttributeDefinition {
  id: string
  label: string
  valueType: AttributeValue['type']
  required: boolean
  appliesTo: string[]
  unit?: string
  allowedValues?: string[]
  evidenceExpectation: 'assertion' | 'source' | 'corroborated' | 'verification'
  comparison: 'none' | 'lower_better' | 'higher_better' | 'target' | 'constraint'
  sensitive: boolean
}

interface CaseAttributeDefinition extends AttributeDefinition {
  id: `custom.${string}`
  origin: 'user' | 'agent_proposed'
  reason: string
  confirmation: 'confirmed' | 'pending' | 'rejected'
  proposedBy: string
  createdAt: string
}
```

The compiler turns these definitions into runtime validators, comparison metadata, and schema-driven forms. A pack may provide a stricter Zod schema for a tool result or a known structured artifact, but entity storage still uses the extensible attribute protocol.

### Case-defined attributes

When the user cares about something the pack did not anticipate, Pax creates a case-scoped `AttributeDefinition` under the `custom.` namespace. For a car case, examples include:

- `custom.dog_crate_fit` as a boolean or explicit unknown;
- `custom.garage_clearance` as a number with `inch` unit;
- `custom.motion_sickness_on_test_drive` as an enum;
- `custom.parent_entry_comfort` as a human-attested rating.

The extension stores who introduced it, why it matters, its value type, applicable entities, evidence expectation, and creation event. Agent-proposed definitions require confirmation before becoming decision criteria. A custom definition is pinned to the case and never mutates the installed pack.

### Extensible criteria

```ts
interface Criterion {
  id: string
  label: string
  kind: 'hard_constraint' | 'preference' | 'consideration'
  weight: number
  direction: 'higher_better' | 'lower_better' | 'target' | 'qualitative'
  target?: AttributeValue
  appliesToAttribute?: string
  question?: string
  origin: 'pack' | 'user' | 'agent_proposed'
  status: 'active' | 'excluded'
}
```

Users may add, remove, rename, or reweight non-required criteria. Pack-required safety or policy criteria can be reweighted only when the manifest allows it and cannot be deleted. Agent-proposed criteria remain proposals until confirmed by the user.

### Case-specific questions to resolve

Each pack declares a `userConcern` obligation template. Adding a hard constraint or a criterion that requires evidence creates a case-specific obligation such as `case.<caseId>.dog-crate-fit`. The generated obligation inherits pack bounds and evidence semantics, records its originating criterion, and participates in readiness and invalidation like a pack obligation.

The model may propose such a question but cannot mark it satisfied. If no installed tool can investigate it, Pax records the unknown explicitly and asks for user evidence or a human observation. It never fabricates a capability or a value.

## Decision Pack source contract

The canonical authorable manifest is declarative JSON validated by `DecisionPackManifestSchema`. Built-in packs may use a typed `definePack()` helper, but compilation serializes and validates the same non-executable manifest.

```ts
interface DecisionPackManifest {
  schemaVersion: '1.0'
  identity: PackIdentity
  activation: PackActivation
  entities: EntityTypeDefinition[]
  attributes: AttributeDefinition[]
  criteria: {
    defaults: CriterionDefinition[]
    allowUserDefined: boolean
    protectedCriterionIds: string[]
  }
  obligations: ObligationTemplate[]
  extensionPolicy: {
    allowCaseAttributes: boolean
    allowCaseCriteria: boolean
    allowCaseObligations: boolean
    userConcernTemplateId: string
  }
  skills: SkillReference[]
  specialists: SpecialistDefinition[]
  orchestration: OrchestrationDefinition
  tools: ToolDeclaration[]
  policies: PolicyDefinition[]
  presentation: PresentationDefinition
  evaluation: PackEvaluationDefinition
}
```

A pack bundle contains:

```text
packs/<pack-id>/
  pack.json
  README.md
  skills/<skill-id>/SKILL.md
  fixtures/<scenario-id>/*.json
  scenarios/<scenario-id>.json
  tests/<pack-id>.conformance.test.ts
```

Custom executable tool adapters live in the application tool registry, not inside an untrusted pack bundle.

## Pack creation paths

### No-code pack

A no-code pack may reuse installed specialists, skills, tools, generic UI components, and Graph/Swarm templates. It consists only of declarative files. After compilation, conformance tests, and human approval, it can be installed without executing authored code.

### Developer pack

A developer pack may add a custom source connector, parser, deterministic calculator, or optional visualization. Each new tool requires Zod input/output schemas, production and fixture implementations, provenance behavior, time/size/cancellation limits, redaction rules, and tests. New executable code requires normal repository review and deployment.

## `pack-authoring` Strands skill

The repository ships a real Strands AgentSkill at `apps/agent/skills/pack-authoring/SKILL.md`. Its purpose is to help a person author a pack; it is not enabled inside normal decision runs.

The skill conducts a bounded authoring interview and produces:

1. the decision boundary and prohibited effects;
2. default and required criteria;
3. required obligations and evidence levels;
4. reusable capability selections from the installed catalog;
5. Graph, Swarm, single-agent, or hybrid orchestration under explicit limits;
6. extension policies for unanticipated user concerns;
7. presentation metadata for the generic right-pane UI;
8. at least one success, incomplete-evidence, steering, and human-boundary scenario;
9. a declarative pack draft and readable authoring report.

The skill may call only bounded authoring tools:

- `pack_catalog` — list installed skills, specialists, tools, UI renderers, and orchestration templates;
- `pack_scaffold` — create files only under the selected pack draft directory;
- `pack_validate` — run schema, reference, security, and graph/bounds validation;
- `pack_test` — run deterministic conformance and scenario tests;
- `pack_diff` — compare a draft with an installed version;
- `pack_publish` — request explicit human confirmation, then install a validated artifact.

It receives no arbitrary shell tool and cannot write outside the pack draft root. `pack_publish` rejects failing validation, missing negative scenarios, undeclared capabilities, executable content, and any request whose actor is not human.

Configuration:

- `PAX_AUTHORING_ENABLED=false` by default;
- enabled for local/developer authoring and automated tests;
- disabled in the unauthenticated public hackathon deployment;
- public demo documentation shows the authoring transcript and commands without exposing a writable authoring endpoint.

The initial authoring entry point is `pnpm pax pack:author`. A graphical Pack Studio, marketplace, arbitrary composition, and multi-tenant publishing are not part of the hackathon build.

## Compiler and registry

`compilePack(source, capabilityCatalog): CompiledDecisionPack` performs:

1. source schema and size validation;
2. stable ID and semantic-version validation;
3. duplicate and dangling-reference checks;
4. attribute, criterion, and obligation rule compilation;
5. capability allowlist resolution;
6. Graph reachability/cycle bounds or Swarm membership/bounds checks;
7. human-authority and prohibited-effect checks;
8. extension-policy validation;
9. generic UI renderability checks;
10. negative-scenario presence checks;
11. deterministic canonical serialization and SHA-256 hash generation. The hash covers semantic source and resolved capability versions; it excludes `compiledAt` and other build-time timestamps.

The registry stores only compiled packs. Each case pins `packId`, `packVersion`, and `compiledPackHash`. Changing an installed pack creates a new version; it never mutates an existing case.

## Authoring workflow

```text
Describe a decision domain
        ↓
pack-authoring skill interviews the author
        ↓
Draft declarative manifest, skills, and scenarios
        ↓
Compiler validates schemas, references, bounds, and authority
        ↓
Conformance and deterministic scenario tests run
        ↓
Human reviews manifest, trajectory, and diff
        ↓
Human explicitly publishes a versioned compiled pack
        ↓
New cases may route to it
```

LLMs assist at authoring time, but they do not bypass compilation, tests, or publication approval. Runtime models adapt the case/run plan inside the installed pack.

## Required conformance tests

Every pack must prove:

- source and compiled artifact schemas are valid;
- all capability references resolve to the installed catalog;
- required obligations cannot be removed by a case extension;
- custom attributes of every value variant round-trip through events and SQLite;
- an unanticipated user criterion creates a typed case extension and, when evidence is needed, a case obligation;
- changing a custom criterion invalidates dependent evidence, scores, and recommendation;
- unsupported custom concerns become explicit unknowns rather than fabricated values;
- Graph nodes are reachable or Swarm members and transitions are bounded;
- no agent, authoring skill, WebMCP callback, fixture, or restore path can approve a decision;
- pack compilation is deterministic and produces the same hash for semantically identical source;
- a published version cannot mutate a pinned case;
- every declared attribute and case extension renders in the generic right-pane UI;
- authoring tools cannot escape the draft directory or publish without confirmation;
- the public deployment has authoring disabled.

## Hackathon proof

The two hero packs are hand-reviewed reference implementations. The release also includes one compact `apartment-hunt` authoring fixture used only by compiler/conformance tests and documentation. It demonstrates an unanticipated `custom.pet_sensory_fit` concern without becoming a third product demo or expanding the submission narrative.

This proves Pax is a platform with a repeatable extension contract rather than two hard-coded demonstrations, while keeping the visible hackathon scope focused.
