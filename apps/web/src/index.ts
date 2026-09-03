// @sift/web -- barrel export of this task's composition roots. `apps/web` is
// a leaf application (its Vite entry is `src/main.tsx`, not this file); this
// barrel exists for anything that needs to import a piece of the app by
// package name/path rather than mounting it (e.g. a later Playwright helper
// or another task's test harness).
export { App } from './app/App.js';
export {
  AppProviders,
  useSiftCommands,
  useApiConfig,
  useWebMcpAdapter,
} from './app/AppProviders.js';
export type { AppProvidersProps, ApiConfig } from './app/AppProviders.js';
export { createSiftClient, SiftClientError } from './api/sift-client.js';
export type {
  SiftCommands,
  CreateSiftClientOptions,
  SiftClientErrorOptions,
} from './api/sift-client.js';
export { DemoLauncher } from './components/DemoLauncher.js';
export type { DemoLauncherProps } from './components/DemoLauncher.js';
export { CaseHeader } from './components/CaseHeader.js';
export type { CaseHeaderProps, CaseHeaderConnectionState } from './components/CaseHeader.js';
export { getActivityLabel, STATUS_TONES, STATUS_TONE_META } from './components/activity-labels.js';
export type {
  StatusTone,
  StatusToneMeta,
  ActivityLabelEntry,
} from './components/activity-labels.js';
export { ReadinessPanel } from './components/ReadinessPanel.js';
export type { ReadinessPanelProps, ReadinessPanelData } from './components/ReadinessPanel.js';
export { EvidenceCard } from './components/EvidenceCard.js';
export type { EvidenceCardProps, EvidenceItemData } from './components/EvidenceCard.js';
export { ActivityTimeline } from './components/ActivityTimeline.js';
export type { ActivityTimelineProps } from './components/ActivityTimeline.js';
export { RecommendationCard } from './components/RecommendationCard.js';
export type {
  RecommendationCardProps,
  RecommendationWithheld,
} from './components/RecommendationCard.js';
export { ApprovalCard } from './components/ApprovalCard.js';
export type { ApprovalCardProps, ApprovalCardReview } from './components/ApprovalCard.js';
export { RecommendationHero } from './components/RecommendationHero.js';
export type { RecommendationHeroProps } from './components/RecommendationHero.js';
export { deriveWorkspaceStatus, HERO_PHASES } from './components/workspace-status.js';
export type {
  HeroPhase,
  HeroAction,
  HeroActionKind,
  SettledDecision,
  WorkspaceStatus,
  WorkspaceStatusInput,
} from './components/workspace-status.js';
export { formatAttributeValue } from './components/attribute-value-format.js';
export { meetsEvidenceExpectation } from './lib/evidence-expectation.js';
export { DynamicAttributeField } from './components/DynamicAttributeField.js';
export type { DynamicAttributeFieldProps } from './components/DynamicAttributeField.js';
export { OptionEditor } from './components/OptionEditor.js';
export type { OptionEditorProps } from './components/OptionEditor.js';
export { WorkspaceViewSwitcher } from './components/WorkspaceViewSwitcher.js';
export type { WorkspaceViewSwitcherProps } from './components/WorkspaceViewSwitcher.js';
export { DecisionProfileView } from './components/DecisionProfileView.js';
export type { DecisionProfileViewProps } from './components/DecisionProfileView.js';
export {
  deriveDecisionProfile,
  bandWeight,
  PRIORITY_BANDS,
  MISSING_REASON_KINDS,
  SUGGESTED_QUESTION_SOURCES,
} from './components/decision-profile.js';
export type {
  DecisionProfile,
  DecisionProfileConcern,
  DecisionProfilePersonalConcern,
  DecisionProfileMissingItem,
  DecisionProfileSuggestedQuestion,
  PriorityBand,
  MissingReasonKind,
  SuggestedQuestionSource,
} from './components/decision-profile.js';
export { CustomConcernForm } from './components/CustomConcernForm.js';
export type { CustomConcernFormProps } from './components/CustomConcernForm.js';
export { CaseExtensionReviewCard } from './components/CaseExtensionReviewCard.js';
export type { CaseExtensionReviewCardProps } from './components/CaseExtensionReviewCard.js';
export { CaseNotes } from './components/CaseNotes.js';
export type { CaseNotesProps } from './components/CaseNotes.js';
export { AddNoteForm } from './components/AddNoteForm.js';
export type { AddNoteFormProps } from './components/AddNoteForm.js';
export { LiveRunStatus } from './components/LiveRunStatus.js';
export type { LiveRunStatusProps, LiveRunStatusReceipt } from './components/LiveRunStatus.js';
export { WebMcpStatus } from './components/WebMcpStatus.js';
export type { WebMcpStatusProps } from './components/WebMcpStatus.js';
export { ErrorState } from './components/ErrorState.js';
export type { ErrorStateProps } from './components/ErrorState.js';
export { useCaseEvents } from './hooks/use-case-events.js';
export type {
  CaseEventsConnectionState,
  CreateEventSource,
  EventSourceLike,
  EventSourceLikeMessageEvent,
  UseCaseEventsOptions,
  UseCaseEventsResult,
} from './hooks/use-case-events.js';
export { useWidthMode, NARROW_MAX_WIDTH_PX } from './hooks/use-width-mode.js';
export type { WidthMode, UseWidthModeOptions } from './hooks/use-width-mode.js';
