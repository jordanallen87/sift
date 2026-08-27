// @pax/web -- barrel export of this task's composition roots. `apps/web` is
// a leaf application (its Vite entry is `src/main.tsx`, not this file); this
// barrel exists for anything that needs to import a piece of the app by
// package name/path rather than mounting it (e.g. a later Playwright helper
// or another task's test harness), and to replace the Task-1 placeholder's
// stale "real module ships in a later Pax build task" comment now that a
// real module exists.
export { App } from './app/App.js';
export { AppProviders, usePaxCommands } from './app/AppProviders.js';
export type { AppProvidersProps } from './app/AppProviders.js';
export { createPaxClient, PaxClientError } from './api/pax-client.js';
export type {
  PaxCommands,
  CreatePaxClientOptions,
  PaxClientErrorOptions,
} from './api/pax-client.js';
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
export { EvidenceList } from './components/EvidenceList.js';
export type { EvidenceListProps } from './components/EvidenceList.js';
export { ActivityTimeline } from './components/ActivityTimeline.js';
export type { ActivityTimelineProps } from './components/ActivityTimeline.js';
export { RecommendationCard } from './components/RecommendationCard.js';
export type {
  RecommendationCardProps,
  RecommendationWithheld,
} from './components/RecommendationCard.js';
export { ApprovalCard } from './components/ApprovalCard.js';
export type { ApprovalCardProps, ApprovalCardReview } from './components/ApprovalCard.js';
