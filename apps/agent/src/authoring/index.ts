/**
 * Barrel export for the six bounded `pack-authoring` tools
 * (docs/specs/pack-authoring.md "`pack-authoring` Strands skill"):
 * `pack_catalog`, `pack_scaffold`, `pack_validate`, `pack_test`, `pack_diff`,
 * `pack_publish`. See each sibling module's header comment for how it is
 * bounded and which real `@sift/packs`/`@sift/core` function it wraps rather
 * than reimplements.
 */
export {
  buildInstalledCapabilityCatalog,
  packCatalog,
  PackCatalogInputSchema,
  type PackCatalogEntryView,
  type PackCatalogInput,
  type PackCatalogResult,
} from './catalog.js';

export {
  DRAFT_ID_PATTERN,
  SCAFFOLDABLE_PATH_PATTERNS,
  draftDirFor,
  matchesBundleShape,
  packScaffold,
  PackScaffoldInputSchema,
  PackScaffoldRejectedError,
  walkDraftFiles,
  type PackScaffoldInput,
  type PackScaffoldResult,
  type PackScaffoldWrittenFile,
} from './scaffold.js';

export {
  PackDraftNotFoundError,
  PackValidateInputSchema,
  packValidate,
  readDraftManifestJson,
  scanDraftForExecutableContent,
  type AuthoringValidationIssue,
  type PackValidateInput,
  type PackValidateResult,
} from './validate.js';

export {
  PackTestInputSchema,
  loadDraftScenarios,
  packTest,
  type PackTestInput,
  type PackTestResult,
  type ScenarioFileLoadResult,
} from './test.js';

export {
  PackDiffInputSchema,
  PackDiffValidationFailedError,
  packDiff,
  type IdCollectionDiff,
  type PackDiffInput,
  type PackDiffResult,
} from './diff.js';

export {
  PackPublishInputSchema,
  PackPublishRejectedError,
  packPublish,
  type PackPublishInput,
} from './publish.js';

export {
  AUTHORING_SCENARIO_KINDS,
  AuthoringScenarioFileSchema,
  evaluateScenarioCoverage,
  type AuthoringScenarioFile,
  type AuthoringScenarioKind,
  type ScenarioCoverageResult,
} from './scenario-coverage.js';

import type { Clock } from '@sift/core';
import type { CapabilityCatalog, PackRegistry } from '@sift/packs';

/**
 * Shared dependency bundle every bounded authoring tool needs: where drafts
 * live on disk, the installed capability catalog to validate against, and
 * the registry `pack_publish` installs into. Threaded explicitly through
 * every tool call rather than held as hidden module state, so a test (or
 * the CLI, or the Strands agent wiring) can point each call at an isolated
 * temporary draft root and a fresh in-memory registry.
 */
export interface AuthoringToolContext {
  readonly draftRoot: string;
  readonly catalog: CapabilityCatalog;
  readonly registry: PackRegistry;
  readonly clock: Clock;
}
