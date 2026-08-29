/**
 * The "What Pax found" review surface (docs/specs/product.md "Workspace
 * layout" region 4, evidence half), reached from the closed-by-default
 * `DisclosureSection` row. Unlike `EvidenceList`'s always-inline rendering,
 * this is a controlled `Sheet` with three tab views over the same
 * `EvidenceItemData[]` -- List, Table, and Kanban -- so a case with many
 * findings can be scanned densely (Table/Kanban) or reviewed one at a time
 * with full controls (List), without the workspace column growing without
 * bound.
 *
 * The List tab is the only view with live disposition controls; it reuses
 * `EvidenceCard` unchanged (same optional `onSetDisposition`/
 * `dispositionPending` contract `EvidenceList` already threads) plus its
 * `collapsed` prop for the dimmed "reviewed" state the project owner asked
 * for: "something like dimming or making the item partially transparent to
 * make it look like they're done." `reviewedThisSession` tracks which
 * `evidenceLink.id`s the human has acted on *in this sheet instance* --
 * not derived from `evidenceLink.disposition` itself, since every item
 * already has some disposition (default `included`) before a human ever
 * looks at it; only an explicit action marks it reviewed.
 *
 * Table and Kanban are deliberately read-only fast-scan views -- neither
 * reuses `EvidenceCard`, both render their own compact markup.
 */
import { useState } from 'react';
import { EVIDENCE_DISPOSITIONS, type EvidenceDisposition, type EvidenceVerdict } from '@pax/contracts';
import { EvidenceCard, type EvidenceItemData } from './EvidenceCard.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface FindingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Never `null` here -- the caller only renders/opens this sheet once a case exists (contrast `EvidenceList.items`, which is `null` before a case is open). */
  items: EvidenceItemData[];
  onSetDisposition?: (evidenceId: string, disposition: EvidenceDisposition, reason: string) => void;
  dispositionPendingId?: string | null;
}

const DISPOSITION_CHIP_TONE: Record<EvidenceDisposition, StatusTone> = {
  included: 'satisfied',
  excluded: 'blocked',
  questioned: 'open',
};

const DISPOSITION_LABEL: Record<EvidenceDisposition, string> = {
  included: 'Included',
  excluded: 'Excluded',
  questioned: 'Questioned',
};

const VERDICT_GLYPH: Record<EvidenceVerdict, string> = {
  pass: '✓',
  fail: '✕',
  error: '⚠',
  degraded: '△',
  skipped: '○',
};

function countByDisposition(items: EvidenceItemData[]): Record<EvidenceDisposition, number> {
  const counts: Record<EvidenceDisposition, number> = { included: 0, excluded: 0, questioned: 0 };
  for (const item of items) {
    counts[item.evidenceLink.disposition] += 1;
  }
  return counts;
}

function groupByDisposition(
  items: EvidenceItemData[],
): Record<EvidenceDisposition, EvidenceItemData[]> {
  const groups: Record<EvidenceDisposition, EvidenceItemData[]> = {
    included: [],
    excluded: [],
    questioned: [],
  };
  for (const item of items) {
    groups[item.evidenceLink.disposition].push(item);
  }
  return groups;
}

function SummaryChip({ tone, children }: { tone: StatusTone; children: string }) {
  const meta = STATUS_TONE_META[tone];
  return (
    <span
      className="label-caps inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
      style={{ color: meta.ink, backgroundColor: meta.bg }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {children}
    </span>
  );
}

export function FindingsSheet({
  open,
  onOpenChange,
  items,
  onSetDisposition,
  dispositionPendingId = null,
}: FindingsSheetProps) {
  const [reviewedThisSession, setReviewedThisSession] = useState<Set<string>>(() => new Set());

  function handleSetDisposition(
    evidenceId: string,
    disposition: EvidenceDisposition,
    reason: string,
  ) {
    setReviewedThisSession((prev) => {
      if (prev.has(evidenceId)) return prev;
      const next = new Set(prev);
      next.add(evidenceId);
      return next;
    });
    onSetDisposition?.(evidenceId, disposition, reason);
  }

  const counts = countByDisposition(items);
  const grouped = groupByDisposition(items);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="findings-sheet">
        <SheetHeader>
          <SheetTitle>What Pax found</SheetTitle>
          <SheetDescription className="visually-hidden">
            Review the evidence Pax has gathered for this case.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {items.length === 0 ? (
            <p
              data-testid="findings-sheet-empty"
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
            >
              No evidence has been gathered yet.
            </p>
          ) : (
            <div className="flex flex-col gap-[var(--space-3)]">
              <div
                data-testid="findings-sheet-summary"
                className="flex flex-wrap gap-[var(--space-1-5)]"
              >
                {EVIDENCE_DISPOSITIONS.map((disposition) => (
                  <SummaryChip key={disposition} tone={DISPOSITION_CHIP_TONE[disposition]}>
                    {`${counts[disposition]} ${disposition}`}
                  </SummaryChip>
                ))}
              </div>

              <Tabs defaultValue="list">
                <TabsList
                  data-testid="findings-sheet-tabs"
                  className="min-h-[var(--size-touch-target-min)] w-full"
                >
                  <TabsTrigger data-testid="findings-sheet-tab-list" value="list">
                    List
                  </TabsTrigger>
                  <TabsTrigger data-testid="findings-sheet-tab-table" value="table">
                    Table
                  </TabsTrigger>
                  <TabsTrigger data-testid="findings-sheet-tab-kanban" value="kanban">
                    Kanban
                  </TabsTrigger>
                </TabsList>

                <TabsContent data-testid="findings-sheet-view-list" value="list">
                  <ul
                    data-testid="findings-sheet-list-items"
                    className="flex flex-col gap-[var(--space-2)]"
                  >
                    {items.map((item) => (
                      <li key={item.evidenceLink.id}>
                        <EvidenceCard
                          item={item}
                          collapsed={reviewedThisSession.has(item.evidenceLink.id)}
                          dispositionPending={dispositionPendingId === item.evidenceLink.id}
                          {...(onSetDisposition
                            ? {
                                onSetDisposition: (
                                  disposition: EvidenceDisposition,
                                  reason: string,
                                ) => {
                                  handleSetDisposition(item.evidenceLink.id, disposition, reason);
                                },
                              }
                            : {})}
                        />
                      </li>
                    ))}
                  </ul>
                </TabsContent>

                <TabsContent data-testid="findings-sheet-view-table" value="table">
                  <ul
                    data-testid="findings-sheet-table-items"
                    className="flex flex-col gap-[var(--space-1)]"
                  >
                    {items.map((item) => {
                      const { evidenceLink, claim } = item;
                      return (
                        <li
                          key={evidenceLink.id}
                          data-testid={`findings-sheet-table-row-${evidenceLink.id}`}
                          className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] bg-card px-[var(--space-2)] py-[var(--space-1-5)] text-[length:var(--font-size-sm)]"
                        >
                          <span aria-hidden="true" className="w-[1.5em] shrink-0 text-center">
                            {VERDICT_GLYPH[evidenceLink.verdict]}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">
                            {claim?.statement ?? evidenceLink.summary}
                          </span>
                          <Badge
                            variant="outline"
                            className="label-caps shrink-0 rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] text-[var(--color-ink-secondary)]"
                          >
                            {DISPOSITION_LABEL[evidenceLink.disposition]}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </TabsContent>

                <TabsContent data-testid="findings-sheet-view-kanban" value="kanban">
                  {/* Horizontal scroll on its own self-contained container, not the page -- matching OptionComparison.tsx's identical `overflow-x-auto` pattern for wide, self-contained content. */}
                  <div
                    className="overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label="Findings by disposition -- scroll horizontally to see every column"
                  >
                    <div
                      data-testid="findings-sheet-kanban"
                      className="flex gap-[var(--space-3)]"
                    >
                      {EVIDENCE_DISPOSITIONS.map((disposition) => (
                        <div
                          key={disposition}
                          data-testid={`findings-sheet-kanban-column-${disposition}`}
                          className="flex w-[200px] shrink-0 flex-col gap-[var(--space-2)]"
                        >
                          <h3 className="label-caps text-[var(--color-ink-secondary)]">
                            {`${DISPOSITION_LABEL[disposition]} (${grouped[disposition].length})`}
                          </h3>
                          <ul className="flex flex-col gap-[var(--space-2)]">
                            {grouped[disposition].map((item) => (
                              <li
                                key={item.evidenceLink.id}
                                data-testid={`findings-sheet-kanban-card-${item.evidenceLink.id}`}
                                className="rounded-[var(--radius-md)] bg-card p-[var(--space-2)] text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
                              >
                                {item.claim?.statement ?? item.evidenceLink.summary}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
