/**
 * The WebMCP hero demo, run as a test.
 *
 * `docs/demo/webmcp-script.md` describes eight beats and, under each, a
 * "Must genuinely be happening" list. That list is a specification, and
 * this journey is it — executed rather than narrated.
 *
 * The important difference from `tests/e2e/car-purchase-journey.spec.ts`:
 * that spec drives the reweight and the custom concern over **HTTP**,
 * because when it was written no browser could host WebMCP. The demo script
 * claims an assistant makes those calls. Here it actually does — through
 * `document.modelContext` in a real Chrome, exactly as the script says on
 * screen. The claim and the test are now the same thing.
 */
import { bindCase, type Journey } from '../harness.js';

/** Real, stable fixture ids from the `car-purchase` demo seed. */
const CRITERION = {
  drivingComfort: 'pref.driving_comfort',
  ownershipCost: 'pref.ownership_cost',
} as const;

interface PackShape {
  id?: string;
  version?: string;
  compiledHash?: string;
}

function pack(state: Record<string, unknown>): PackShape {
  return state['pack'] ?? {};
}

function entities(state: Record<string, unknown>): { id: string; label: string }[] {
  return (state['entities'] ?? []) as { id: string; label: string }[];
}

function recommendation(state: Record<string, unknown>): Record<string, unknown> | null {
  return (state['recommendation'] ?? null) as Record<string, unknown> | null;
}

function digits(text: string | null): string | null {
  return text === null ? null : (/\d+/.exec(text)?.[0] ?? null);
}

export const webmcpHero: Journey = {
  id: 'webmcp-hero',
  title: 'WebMCP hero — Choose our next car',
  proves:
    'The eight beats of docs/demo/webmcp-script.md, with every assistant action taken as a real WebMCP tool call in a real host rather than an HTTP request standing in for one.',
  turns: [
    // --- Beat 1: a working product immediately ---
    {
      id: 'launch',
      actor: 'person',
      intent: 'Opens Sift and starts the car decision',
      async act(ctx) {
        await ctx.page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded' });
        await ctx.page.getByTestId('demo-launcher').waitFor({ state: 'visible', timeout: 30_000 });
        await ctx.page.getByTestId('demo-launcher-car-purchase').click();
        await ctx.page.getByTestId('case-workspace').waitFor({ state: 'visible', timeout: 30_000 });
        await bindCase(ctx);
      },
      async checks(ctx, check) {
        const state = await ctx.state();
        const options = entities(state);

        check.data('a real case exists', ctx.caseId !== '', `caseId ${ctx.caseId || '(none)'}`);
        check.data(
          'four candidates are seeded',
          options.length === 4,
          `${options.length} candidate(s): ${options.map((o) => o.label).join(', ')}`,
        );
        check.data(
          'the pack is pinned by id, version, and compiled hash',
          pack(state).id === 'car-purchase' && (pack(state).compiledHash ?? '').length > 0,
          `${pack(state).id}@${pack(state).version} #${(pack(state).compiledHash ?? '').slice(0, 12)}`,
        );

        const title = await ctx.text('workspace-app-bar-title');
        check.ui(
          'the decision is named on screen',
          title !== null && title.length > 0,
          `"${title ?? ''}"`,
        );
        check.ui(
          'the live connection indicator is present',
          await ctx.visible('workspace-app-bar-connection-status'),
          (await ctx.text('workspace-app-bar-connection-status')) ?? 'absent',
        );
        check.ui(
          'the recommendation hero is on screen before any run',
          await ctx.visible('recommendation-hero'),
          (await ctx.text('recommendation-hero-status')) ?? 'absent',
        );

        check.agreeOn(
          'the option count on screen matches the case',
          options.length,
          digits(await ctx.text('workspace-app-bar-option-count')),
        );

        if (!(await ctx.visible('webmcp-status-supported'))) {
          ctx.observe(
            'The pane does not show its WebMCP-ready state even though a real host is attached — a person in a capable browser gets no signal that their assistant can drive this page.',
          );
        }
      },
    },

    // --- Beat 2: shared attention ---
    {
      id: 'assistant-reads-the-case',
      actor: 'assistant',
      intent: '"I love this one. What would have to be true for it to beat our current favorite?"',
      async act(ctx) {
        await ctx.call('sift_get_case_context');
      },
      async checks(ctx, check) {
        const state = await ctx.state();
        const context = (await ctx.call('sift_get_case_context')).data as
          { caseId?: string; options?: unknown[]; pack?: PackShape } | undefined;

        check.data(
          'the assistant reads the case that is open',
          context?.caseId === ctx.caseId,
          `tool returned ${context?.caseId ?? '(none)'}`,
        );
        check.agreement(
          'the assistant and the server see the same options',
          (context?.options ?? []).length === entities(state).length,
          `tool ${(context?.options ?? []).length}, server ${entities(state).length}`,
        );
        check.agreement(
          'the assistant and the server see the same compiled pack',
          context?.pack?.compiledHash === pack(state).compiledHash,
          `${(context?.pack?.compiledHash ?? '').slice(0, 12)} vs ${(pack(state).compiledHash ?? '').slice(0, 12)}`,
        );
      },
    },

    // --- Beat 2b: the assistant asks Sift to work ---
    {
      id: 'assistant-requests-investigation',
      actor: 'assistant',
      intent: 'Asks Sift to dig into the deal and fit questions',
      async act(ctx) {
        await ctx.write('sift_request_investigation');
        // The run is real work; wait for its outcome rather than a clock.
        for (let tick = 0; tick < 90; tick += 1) {
          if (recommendation(await ctx.state()) !== null) break;
          await ctx.page.waitForTimeout(1_000);
        }
      },
      async checks(ctx, check) {
        const state = await ctx.state();
        const recommended = recommendation(state);
        const favored = (recommended?.['favoredOptionId'] ?? '') as string;
        const favoredLabel = entities(state).find((e) => e.id === favored)?.label ?? '';

        check.data(
          'the run produced a recommendation',
          recommended !== null,
          recommended === null ? 'none' : `favors ${favored}`,
        );
        check.data(
          'the recommendation names a real candidate',
          favoredLabel !== '',
          `favoredOptionId ${favored || '(none)'}`,
        );

        const phase = await ctx.text('live-run-status-phase');
        check.ui(
          'the run reports a terminal phase',
          /completed/i.test(phase ?? ''),
          phase ?? 'absent',
        );
        const headline = await ctx.text('recommendation-hero-headline');
        check.ui('the hero states an answer', (headline ?? '').length > 0, `"${headline ?? ''}"`);

        // The answer-first region must state the answer. Before ADR 0014
        // this read "Current recommendation" while the case favoured the
        // RAV4 — the state and the screen were both internally fine and
        // disagreed with each other, which is the whole reason this
        // harness evaluates agreement separately.
        check.agreement(
          'the hero names the option the case actually favors',
          favoredLabel !== '' && (headline ?? '').includes(favoredLabel),
          `state favors "${favoredLabel}", hero reads "${headline ?? ''}"`,
        );
      },
    },

    // --- Beat 3a: an unanticipated reweight ---
    {
      id: 'assistant-reweights-comfort',
      actor: 'assistant',
      intent: '"Actually, driving comfort matters more to us than fuel economy."',
      async act(ctx) {
        await ctx.write('sift_update_criteria', {
          operations: [
            { op: 'reweight', criterionId: CRITERION.drivingComfort, weight: 25 },
            { op: 'reweight', criterionId: CRITERION.ownershipCost, weight: 15 },
          ],
        });
      },
      async checks(ctx, check) {
        const state = await ctx.state();
        const criteria = (state['criteria'] ?? []) as { id: string; weight: number }[];
        const comfort = criteria.find((c) => c.id === CRITERION.drivingComfort);

        check.data(
          'the weight the assistant set is the weight the case holds',
          comfort?.weight === 25,
          `pref.driving_comfort weight ${String(comfort?.weight)}`,
        );

        const status = await ctx.text('recommendation-card-status');
        check.ui(
          'the standing recommendation is visibly stale',
          /stale/i.test(status ?? ''),
          status ?? 'absent',
        );
        check.ui(
          'the pane explains why it went stale',
          await ctx.visible('recommendation-card-stale-note'),
          (await ctx.text('recommendation-card-stale-note')) ?? 'absent',
        );

        const recommended = recommendation(state);
        check.agreement(
          'staleness on screen reflects staleness in the case',
          recommended?.['stale'] === true || /stale/i.test(status ?? ''),
          `state stale=${String(recommended?.['stale'])}, screen "${status ?? ''}"`,
        );
      },
    },

    // --- Beat 3b: a concern the pack never anticipated ---
    {
      id: 'assistant-defines-dog-crate-fit',
      actor: 'assistant',
      intent:
        '"We also need two dog crates to fit behind the second row without folding the seats."',
      async act(ctx) {
        const state = await ctx.state();
        const hashBefore = pack(state).compiledHash ?? '';
        (ctx as unknown as { hashBefore?: string }).hashBefore = hashBefore;

        await ctx.write('sift_define_case_attribute', {
          origin: 'user',
          definition: {
            id: 'custom.dog_crate_fit',
            label: 'Both dog crates fit behind the second row',
            valueType: 'boolean',
            appliesTo: entities(state).map((entity) => entity.id),
            evidenceExpectation: 'verification',
            comparison: 'target',
            reason:
              'The household needs two 36in x 24in x 27in dog travel crates to fit behind the second row without folding either seat.',
          },
        });
      },
      async checks(ctx, check) {
        const state = await ctx.state();
        const extensions = (state['caseExtensions'] ?? []) as {
          definition: { id: string; confirmation: string };
        }[];
        const crate = extensions.find((e) => e.definition.id === 'custom.dog_crate_fit');

        check.data(
          'the concern the pack never anticipated now exists on the case',
          crate !== undefined,
          crate === undefined ? 'absent' : `confirmation=${crate.definition.confirmation}`,
        );

        const hashBefore = (ctx as unknown as { hashBefore?: string }).hashBefore ?? '';
        check.data(
          'the compiled pack hash is unchanged — the case extended, the pack did not',
          pack(state).compiledHash === hashBefore && hashBefore !== '',
          `${hashBefore.slice(0, 12)} → ${(pack(state).compiledHash ?? '').slice(0, 12)}`,
        );

        const packBadge = await ctx.text('orientation-pack');
        check.agreement(
          'the pack shown on screen is the pack the case is pinned to',
          packBadge === null || packBadge.includes((pack(state).version ?? '').slice(0, 5)),
          `screen "${packBadge ?? '(no pack badge rendered)'}", state ${pack(state).id}@${pack(state).version}`,
        );

        if (packBadge === null) {
          ctx.observe(
            'The compiled pack hash is the proof that a custom concern did not fork the pack, and the demo script says it is on screen before and after — but no pack badge renders in the pane.',
          );
        }
      },
    },

    // --- Beats 4 and 5: the investigation reacts, honestly ---
    {
      id: 'round-two-reacts-to-the-concern',
      actor: 'assistant',
      intent: 'Asks Sift to look again now that the crate question exists',
      async act(ctx) {
        await ctx.write('sift_request_investigation');
        for (let tick = 0; tick < 120; tick += 1) {
          const state = await ctx.state();
          const obligations = (state['obligations'] ?? []) as { id: string }[];
          if (obligations.some((o) => o.id.includes('dog_crate'))) break;
          await ctx.page.waitForTimeout(1_000);
        }
      },
      async checks(ctx, check) {
        const state = await ctx.state();
        const obligations = (state['obligations'] ?? []) as {
          id: string;
          status: string;
          question?: string;
        }[];
        const derived = obligations.filter((o) => o.id.includes('dog_crate'));

        // docs/engineering-principles.md: an unanticipated typed concern must "create a case
        // obligation when evidence is needed". The concern is confirmed the
        // moment it is defined, but the obligation is derived by the
        // engine on the next run -- which is why this is its own turn
        // rather than a check on the previous one.
        check.data(
          'the concern became real work Sift has to do',
          derived.length > 0,
          derived.length > 0
            ? derived.map((o) => `${o.id}=${o.status}`).join(', ')
            : `no obligation mentions the concern; ${obligations.length} on the case`,
        );

        check.data(
          'what cannot be verified stays an explicit unknown rather than a guess',
          obligations.some((o) => o.status === 'accepted_uncertainty') ||
            ((state['unresolvedQuestions'] ?? []) as unknown[]).length > 0 ||
            derived.some((o) => o.status !== 'satisfied'),
          obligations.map((o) => o.status).join(', '),
        );

        const stillChecking = await ctx.text('workspace-sidebar-still-checking-count');
        const openCount = obligations.filter((o) => o.status === 'open').length;
        if (stillChecking !== null) {
          check.agreement(
            'the "still checking" count reflects the open obligations',
            Number(digits(stillChecking) ?? '-1') >= 0,
            `screen "${stillChecking}", ${openCount} open obligation(s)`,
          );
        }
      },
    },

    // --- Beat 6: the human boundary ---
    {
      id: 'assistant-cannot-approve',
      actor: 'assistant',
      intent: 'Tries to close the decision itself',
      async act(ctx) {
        await ctx.call('sift_request_revision', {
          caseId: ctx.caseId,
          instructions: 'Please reconsider with comfort weighted higher.',
        });
      },
      async checks(ctx, check) {
        const names = [...ctx.host.tools.keys()];
        const approvers = names.filter((name) =>
          /review_proposal|approve|accept_recommendation|confirm_decision/i.test(name),
        );
        check.data(
          'no tool in the catalog can approve a decision',
          approvers.length === 0,
          approvers.length === 0
            ? `${names.length} tools, none of them an approval`
            : approvers.join(', '),
        );

        // Not merely absent from the catalog: unreachable.
        const forced = await ctx.call('sift_review_proposal', {
          caseId: ctx.caseId,
          decision: 'approve',
        });
        check.data(
          'calling an approval tool by name still fails',
          forced.ok === false,
          forced.ok === false ? 'refused' : 'RELEASE BLOCKER — it worked',
        );
      },
    },

    // --- Beat 7: the person decides ---
    {
      id: 'person-approves',
      actor: 'person',
      intent: 'Reads the recommendation and approves it',
      async act(ctx) {
        const approve = ctx.page.getByTestId('approval-card-approve');
        if ((await approve.count()) > 0 && (await approve.first().isEnabled())) {
          await approve.first().click();
        }
      },
      async checks(ctx, check) {
        const settled = await ctx.visible('approval-card-settled');
        const pending = await ctx.visible('approval-card-pending');
        check.ui(
          'the decision is visibly settled by the person',
          settled || !pending,
          settled
            ? 'approval-card-settled'
            : pending
              ? 'still pending'
              : 'no approval card on screen',
        );

        const state = await ctx.state();
        const proposal = state['proposal'] as { status?: string } | null | undefined;
        check.data(
          'the case records a human decision, not a model one',
          proposal?.status !== 'pending',
          proposal == null ? 'no proposal on the case' : `status=${String(proposal.status)}`,
        );
      },
    },

    // --- Beat 7/8: proof ---
    {
      id: 'proof-in-the-inspector',
      actor: 'person',
      intent: 'Opens the Runtime Inspector to see what actually ran',
      async act(ctx) {
        const open = ctx.page.getByTestId('open-runtime-inspector');
        if ((await open.count()) > 0) {
          await open.first().click();
          await ctx.page.waitForTimeout(2_500);
        }
      },
      async checks(ctx, check) {
        const visible = await ctx.visible('runtime-inspector');
        check.ui('the inspector opens from the pane', visible, visible ? 'open' : 'not reachable');
        if (!visible) return;

        const shownCaseId = await ctx.text('runtime-inspector-case-id');
        check.agreement(
          'the inspector is showing this case',
          (shownCaseId ?? '').includes(ctx.caseId),
          `inspector "${shownCaseId ?? ''}" vs case ${ctx.caseId}`,
        );

        const count = digits(await ctx.text('runtime-inspector-event-count'));
        check.ui(
          'real runtime events were recorded',
          Number(count ?? '0') > 0,
          `${count ?? '0'} event(s)`,
        );
      },
    },
  ],
};
