/**
 * The primary workspace view switcher (`docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`, decision item 5;
 * `docs/change-sets/2026-08-30-generic-decision-workspace.md` §6's "Primary
 * workspace view switcher -- e.g. Quick Pick / List / Compare / Board" and
 * §8's "These are not cosmetic renderings of identical information -- each
 * solves a different decision task"). This is the region that dominates the
 * page below the answer-first hero, replacing the old "Compare the
 * options" disclosure row's unconditional `OptionComparison` table -- ADR
 * 0005 ("Workspace View State and Option Views") names that component's
 * defect directly: no prop, piece of local state, or hook anywhere in it
 * could narrow which options or attributes render.
 *
 * All four generic views change-set §8 names now exist as separate,
 * prop-driven, purely presentational components per ADR 0005's own
 * component-architecture decision -- `QuickPickView`, `OptionListView`,
 * `OptionCompareView`, and `OptionBoardView`. This component's only job is
 * to own the tab affordance and route real snapshot data into whichever one
 * is selected; it holds no option state of its own.
 *
 * List and Board were briefly rendered here as honest "not built yet"
 * placeholders while their components were still being written in parallel,
 * deliberately rather than stubbing fabricated views over real option data.
 * Both are now wired to the real components and that placeholder path is
 * gone -- there is no remaining branch that can render a view Sift cannot
 * actually populate.
 *
 * `mode` is deliberately caller-owned state, not local `useState` here: ADR
 * 0005 decision 1 designed `WorkspaceViewState.mode` to persist through
 * `CaseState` via the `SelectionPatch`/`updateSelection()` escape hatch so
 * the browser and a WebMCP-driven ChatGPT session can share the same view
 * (change-set §13, §30). No `sift_set_view` command exists yet in this
 * codebase to actually write that field (only `sift_focus_option` is wired
 * today -- confirmed by reading `apps/web/src/model-context/
 * register-sift-tools.ts` and `apps/agent/src/services/command-service.ts`
 * directly), so `App.tsx` currently supplies `mode` from plain session-local
 * `useState` rather than a real server round-trip. This component's own
 * contract does not assume that: it takes `mode`/`onModeChange` as props so
 * a future caller can swap the source of truth to the real persisted
 * `WorkspaceViewState.mode` without this component changing at all.
 *
 * `layout` for `OptionCompareView`, by contrast, IS decided locally here via
 * `useWidthMode` (Phase B3, `apps/web/src/hooks/use-width-mode.ts`) rather
 * than threaded through as a prop: it is a real-time viewport fact, not
 * case/session state anything needs to persist or share with a WebMCP
 * caller (ADR 0005 Decision 4's "narrow and expanded modes are two
 * intentional information architectures" is about what a given width
 * *renders*, not something ChatGPT would ever set on the user's behalf).
 * This is this hook's first real consumer -- previously `layout="narrow"`
 * was hard-coded here, which is exactly the gap ADR 0005 Decision 4 named
 * ("no existing component or hook ... provides a starting point for the
 * width-detection mechanism itself").
 */
import { WORKSPACE_VIEW_MODES, type WorkspaceViewMode } from '@sift/contracts';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@sift/contracts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QuickPickView } from './QuickPickView.js';
import { OptionCompareView } from './OptionCompareView.js';
import { OptionListView } from './OptionListView.js';
import { OptionBoardView } from './OptionBoardView.js';
import { useWidthMode } from '../hooks/use-width-mode.js';

export interface WorkspaceViewSwitcherProps {
  mode: WorkspaceViewMode;
  onModeChange: (mode: WorkspaceViewMode) => void;
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  presentation: PresentationDefinition | null;
  selectedOptionId: string | null;
  onFocusOption: (optionId: string) => void;

  // Quick Pick's own triage queue position -- see this file's header
  // comment on why this is caller state, not local state here.
  quickPickPosition: number;
  onQuickPickPass: (optionId: string) => void;
  onQuickPickMaybe: (optionId: string) => void;
  onQuickPickShortlist: (optionId: string) => void;
  onQuickPickFocusChange: (optionId: string) => void;

  // Board placement, held by the caller for the same reason `mode` is: it
  // belongs in the persisted `WorkspaceViewState.board` once a command
  // exists to write it, and this component should not have to change when
  // that source of truth swaps. Board placement is deliberately NOT derived
  // from case state -- where an option sits is the user's working
  // arrangement, not a decision the engine has made about it (change-set
  // §12).
  boardPlacement: Record<string, string>;
  onMoveOption: (optionId: string, toColumnId: string) => void;
}

const VIEW_TAB_LABEL: Record<WorkspaceViewMode, string> = {
  quick_pick: 'Quick Pick',
  list: 'List',
  compare: 'Compare',
  board: 'Board',
};

export function WorkspaceViewSwitcher({
  mode,
  onModeChange,
  options,
  attributeDefinitions,
  presentation,
  selectedOptionId,
  onFocusOption,
  quickPickPosition,
  onQuickPickPass,
  onQuickPickMaybe,
  onQuickPickShortlist,
  onQuickPickFocusChange,
  boardPlacement,
  onMoveOption,
}: WorkspaceViewSwitcherProps) {
  const widthMode = useWidthMode();

  return (
    <section
      data-testid="workspace-view-switcher"
      aria-label="Workspace view"
      className="flex flex-col gap-[var(--space-2)]"
    >
      <Tabs
        value={mode}
        onValueChange={(value) => {
          onModeChange(value as WorkspaceViewMode);
        }}
      >
        <TabsList aria-label="Choose how to view your options">
          {WORKSPACE_VIEW_MODES.map((viewMode) => (
            <TabsTrigger
              key={viewMode}
              data-testid={`workspace-view-tab-${viewMode}`}
              value={viewMode}
            >
              {VIEW_TAB_LABEL[viewMode]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent data-testid="workspace-view-content-quick_pick" value="quick_pick">
          <QuickPickView
            options={options}
            attributeDefinitions={attributeDefinitions}
            position={quickPickPosition}
            onPass={onQuickPickPass}
            onMaybe={onQuickPickMaybe}
            onShortlist={onQuickPickShortlist}
            onFocusChange={onQuickPickFocusChange}
          />
        </TabsContent>

        <TabsContent data-testid="workspace-view-content-compare" value="compare">
          <OptionCompareView
            options={options}
            attributeDefinitions={attributeDefinitions}
            presentation={presentation}
            selectedOptionId={selectedOptionId}
            layout={widthMode}
            onFocusOption={onFocusOption}
          />
        </TabsContent>

        <TabsContent data-testid="workspace-view-content-list" value="list">
          <OptionListView
            options={options}
            attributeDefinitions={attributeDefinitions}
            presentation={presentation}
            selectedOptionId={selectedOptionId}
            onFocusOption={onFocusOption}
          />
        </TabsContent>

        <TabsContent data-testid="workspace-view-content-board" value="board">
          <OptionBoardView
            options={options}
            attributeDefinitions={attributeDefinitions}
            optionColumnIds={boardPlacement}
            selectedOptionId={selectedOptionId}
            onMoveOption={onMoveOption}
            onFocusOption={onFocusOption}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
