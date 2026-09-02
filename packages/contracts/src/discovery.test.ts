/**
 * Adaptive discovery contracts.
 *
 * Every `describe` below names a specific untruth the schema is here to make
 * unrepresentable. The canonical experience
 * (docs/final-plan/final-approved-experience.md) states four boundaries that
 * a type system can genuinely enforce rather than merely document:
 *
 * 1. A model may propose; only a person may confirm. An inference cannot
 *    become a blocker on the model's own authority.
 * 2. Required conversational discovery cannot be skipped into search.
 * 3. A candidate is a *model* unless it carries listing provenance. Nothing
 *    may imply a real listing without one.
 * 4. Shortlist confirmation and the final decision are human-only, so no
 *    tool may be attached to them.
 *
 * These are the rules that stop the demo from lying, so they are tested at
 * the contract boundary where they cannot be bypassed by a caller.
 */
import { describe, expect, it } from 'vitest';
import {
  BlindSpotReviewStateSchema,
  CandidateDispositionRecordSchema,
  CandidateProvenanceSchema,
  DecisionBriefSchema,
  DiscoveryCoverageSchema,
  DiscoveryStateSchema,
  DiscoveryTopicStateSchema,
  DiscoveryTopicTemplateSchema,
  HUMAN_ONLY_MOVE_KINDS,
  InteractionRequestSchema,
  InteractionResponseSchema,
  NextMoveSchema,
  PackDiscoveryDefinitionSchema,
  TopicMappingSchema,
} from './discovery.js';

const AT = '2026-09-02T10:00:00.000Z';

function topic(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    topicId: 'vehicle.occupants',
    label: 'Who and what has to fit',
    status: 'confirmed',
    necessity: 'required',
    valueSummary: 'Two adults, two children in car seats, one large dog',
    origin: 'user',
    humanConfirmed: true,
    updatedAt: AT,
    ...overrides,
  };
}

function interactionRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'interaction-1',
    topicIds: ['vehicle.usage'],
    kind: 'multi_select',
    prompt: 'Which of these will the vehicle need to handle regularly?',
    options: [
      {
        id: 'opt-school',
        label: 'School runs',
        mapsTo: [{ topicId: 'vehicle.usage', valueSummary: 'Daily school runs' }],
      },
      {
        id: 'opt-highway',
        label: 'Long highway trips',
        mapsTo: [{ topicId: 'vehicle.usage', valueSummary: 'Regular highway trips' }],
      },
    ],
    escapeHatches: { allowCustom: true, allowNone: true, allowUnsure: true, allowDefer: false },
    requestedBy: 'model',
    createdAt: AT,
    ...overrides,
  };
}

describe('DiscoveryTopicState: a model cannot confirm on its own authority', () => {
  it('accepts a topic a person stated and confirmed', () => {
    expect(DiscoveryTopicStateSchema.safeParse(topic()).success).toBe(true);
  });

  it('accepts a model-extracted topic parked as inferred_pending', () => {
    const result = DiscoveryTopicStateSchema.safeParse(
      topic({
        status: 'inferred_pending',
        origin: 'model',
        humanConfirmed: false,
        confidence: 0.7,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a model-origin topic claiming confirmed status without human confirmation', () => {
    // The whole "explicit confirmation before an inference becomes a
    // blocker" rule collapses if the model can write `confirmed` itself.
    const result = DiscoveryTopicStateSchema.safeParse(
      topic({ origin: 'model', status: 'confirmed', humanConfirmed: false }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/human/i);
  });

  it('rejects an inferred_pending topic that claims it was human confirmed', () => {
    const result = DiscoveryTopicStateSchema.safeParse(
      topic({ status: 'inferred_pending', origin: 'model', humanConfirmed: true }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a must_work blocker that no human ever confirmed', () => {
    // `must_work` is the tier that removes options from consideration. It is
    // the single most consequential thing a discovery topic can say, so it
    // is unrepresentable without a human behind it.
    const result = DiscoveryTopicStateSchema.safeParse(
      topic({
        importance: 'must_work',
        origin: 'model',
        status: 'confirmed',
        humanConfirmed: false,
      }),
    );
    expect(result.success).toBe(false);
  });

  it('allows needs_verification without human confirmation, because an unknown is not a claim', () => {
    const result = DiscoveryTopicStateSchema.safeParse(
      topic({
        importance: 'needs_verification',
        origin: 'model',
        status: 'inferred_pending',
        humanConfirmed: false,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('requires a value summary for a confirmed topic', () => {
    const result = DiscoveryTopicStateSchema.safeParse(topic({ valueSummary: undefined }));
    expect(result.success).toBe(false);
  });

  it('requires a blocking reason for a blocked topic, so the pane can say why', () => {
    expect(
      DiscoveryTopicStateSchema.safeParse(topic({ status: 'blocked', blockingReason: undefined }))
        .success,
    ).toBe(false);
    expect(
      DiscoveryTopicStateSchema.safeParse(
        topic({
          status: 'blocked',
          blockingReason: 'No catalog model meets both the budget and the towing minimum',
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects an unrecognised status rather than coercing it', () => {
    expect(DiscoveryTopicStateSchema.safeParse(topic({ status: 'skipped' })).success).toBe(false);
  });

  it('accepts not_applicable without a value, because there is nothing to say', () => {
    const result = DiscoveryTopicStateSchema.safeParse(
      topic({ status: 'not_applicable', valueSummary: undefined, importance: undefined }),
    );
    expect(result.success).toBe(true);
  });
});

describe('DecisionBrief: required conversational discovery cannot be skipped', () => {
  const coverage = {
    requiredTotal: 4,
    requiredResolved: 4,
    softTotal: 2,
    softResolved: 1,
    blindSpotReviewComplete: true,
  };

  function brief(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      mode: 'companion',
      useCase: 'family',
      decisionFor: 'a household of four plus a dog',
      outcome: 'a shortlist of vehicle models worth test driving',
      topics: [topic()],
      coverage,
      blindSpotReview: {
        status: 'complete',
        offeredPromptIds: ['blindspot.child_seats', 'blindspot.garage_clearance'],
        selectedPromptIds: ['blindspot.child_seats'],
        acknowledgedAt: AT,
      },
      provisional: false,
      updatedAt: AT,
      ...overrides,
    };
  }

  it('accepts a complete companion brief', () => {
    expect(DecisionBriefSchema.safeParse(brief()).success).toBe(true);
  });

  it('rejects a companion brief carrying a deferred required topic', () => {
    // "Required conversational topics do not offer Skip for now."
    const result = DecisionBriefSchema.safeParse(
      brief({
        topics: [topic({ status: 'deferred', necessity: 'required', valueSummary: undefined })],
        provisional: true,
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/defer/i);
  });

  it('accepts a standalone brief that defers a soft topic and says so', () => {
    const result = DecisionBriefSchema.safeParse(
      brief({
        mode: 'standalone',
        topics: [topic({ status: 'deferred', necessity: 'soft', valueSummary: undefined })],
        provisional: true,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a brief with a deferred topic that still calls its output final', () => {
    // Deferring a topic and then presenting the result as settled is the
    // exact dishonesty `provisional` exists to prevent.
    const result = DecisionBriefSchema.safeParse(
      brief({
        mode: 'standalone',
        topics: [topic({ status: 'deferred', necessity: 'soft', valueSummary: undefined })],
        provisional: false,
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/provisional/i);
  });

  it('rejects coverage claiming more resolved topics than exist', () => {
    const result = DecisionBriefSchema.safeParse(
      brief({ coverage: { ...coverage, requiredResolved: 9 } }),
    );
    expect(result.success).toBe(false);
  });
});

describe('DiscoveryCoverage', () => {
  it('accepts an all-zero coverage for a case that has not started', () => {
    expect(
      DiscoveryCoverageSchema.safeParse({
        requiredTotal: 0,
        requiredResolved: 0,
        softTotal: 0,
        softResolved: 0,
        blindSpotReviewComplete: false,
      }).success,
    ).toBe(true);
  });

  it('rejects negative counts', () => {
    expect(
      DiscoveryCoverageSchema.safeParse({
        requiredTotal: 3,
        requiredResolved: -1,
        softTotal: 0,
        softResolved: 0,
        blindSpotReviewComplete: false,
      }).success,
    ).toBe(false);
  });

  it('rejects soft coverage that exceeds its own total', () => {
    expect(
      DiscoveryCoverageSchema.safeParse({
        requiredTotal: 1,
        requiredResolved: 1,
        softTotal: 1,
        softResolved: 4,
        blindSpotReviewComplete: true,
      }).success,
    ).toBe(false);
  });
});

describe('InteractionRequest: bounded generative UI, never free-form HTML', () => {
  it('accepts a well-formed multi-select the model asked for', () => {
    expect(InteractionRequestSchema.safeParse(interactionRequest()).success).toBe(true);
  });

  it('rejects an interaction kind the pack grammar does not define', () => {
    expect(
      InteractionRequestSchema.safeParse(interactionRequest({ kind: 'html_canvas' })).success,
    ).toBe(false);
  });

  it('rejects an option whose mapping targets a topic this interaction is not about', () => {
    // An option that quietly writes to an unrelated topic is how a bounded
    // interaction turns into an arbitrary state-mutation channel.
    const result = InteractionRequestSchema.safeParse(
      interactionRequest({
        options: [
          {
            id: 'opt-a',
            label: 'School runs',
            mapsTo: [{ topicId: 'vehicle.usage', valueSummary: 'School runs' }],
          },
          {
            id: 'opt-b',
            label: 'Long trips',
            mapsTo: [{ topicId: 'vehicle.budget', valueSummary: 'Under 40k' }],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/vehicle\.budget/);
  });

  it('rejects duplicate option ids, which would make a response ambiguous', () => {
    const result = InteractionRequestSchema.safeParse(
      interactionRequest({
        options: [
          { id: 'same', label: 'One', mapsTo: [{ topicId: 'vehicle.usage', valueSummary: 'One' }] },
          { id: 'same', label: 'Two', mapsTo: [{ topicId: 'vehicle.usage', valueSummary: 'Two' }] },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires at least two options for a select, because a one-option choice is not a choice', () => {
    const result = InteractionRequestSchema.safeParse(
      interactionRequest({
        options: [
          {
            id: 'only',
            label: 'Only',
            mapsTo: [{ topicId: 'vehicle.usage', valueSummary: 'Only' }],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires free_text to carry no options at all', () => {
    expect(
      InteractionRequestSchema.safeParse(interactionRequest({ kind: 'free_text' })).success,
    ).toBe(false);
    expect(
      InteractionRequestSchema.safeParse(interactionRequest({ kind: 'free_text', options: [] }))
        .success,
    ).toBe(true);
  });

  it('has no field capable of preselecting an option', () => {
    // "No suggestion is silently preselected" is guaranteed by omission:
    // there is nowhere to put a default, so `.strict()` rejects any attempt.
    const result = InteractionRequestSchema.safeParse({
      ...interactionRequest(),
      defaultSelectedOptionIds: ['opt-school'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a prompt containing markup', () => {
    expect(
      InteractionRequestSchema.safeParse(
        interactionRequest({ prompt: '<img src=x onerror=alert(1)>Pick one' }),
      ).success,
    ).toBe(false);
  });
});

describe('InteractionResponse: one answer may fill several topics', () => {
  function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      interactionId: 'interaction-1',
      respondedBy: 'human',
      selectedOptionIds: ['opt-school'],
      mappings: [
        {
          topicId: 'vehicle.usage',
          valueSummary: 'Daily school runs',
          origin: 'user',
          confidence: 1,
          requiresConfirmation: false,
        },
      ],
      respondedAt: AT,
      ...overrides,
    };
  }

  it('accepts one response proposing mappings for several distinct topics', () => {
    // "We have two kids in car seats and a big dog, and we cannot go over
    // forty thousand" answers occupants, cargo, and budget at once. The
    // contract has to carry all three or the model will ask again.
    const result = InteractionResponseSchema.safeParse(
      response({
        mappings: [
          {
            topicId: 'vehicle.occupants',
            valueSummary: 'Two adults and two children in car seats',
            origin: 'user',
            confidence: 1,
            requiresConfirmation: false,
          },
          {
            topicId: 'vehicle.cargo',
            valueSummary: 'One large dog travelling in the back',
            origin: 'user',
            confidence: 1,
            requiresConfirmation: false,
          },
          {
            topicId: 'vehicle.budget',
            valueSummary: 'Hard ceiling of 40,000 USD',
            origin: 'user',
            confidence: 1,
            requiresConfirmation: false,
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects two mappings competing over the same topic', () => {
    const result = InteractionResponseSchema.safeParse(
      response({
        mappings: [
          {
            topicId: 'vehicle.usage',
            valueSummary: 'School runs',
            origin: 'user',
            confidence: 1,
            requiresConfirmation: false,
          },
          {
            topicId: 'vehicle.usage',
            valueSummary: 'Highway trips',
            origin: 'user',
            confidence: 1,
            requiresConfirmation: false,
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts an escape response that selected nothing', () => {
    expect(
      InteractionResponseSchema.safeParse(
        response({ selectedOptionIds: [], escape: 'unsure', mappings: [] }),
      ).success,
    ).toBe(true);
  });

  it('rejects a response that both escaped and selected options', () => {
    expect(InteractionResponseSchema.safeParse(response({ escape: 'none' })).success).toBe(false);
  });

  it('rejects an empty response that neither selected, typed, nor escaped', () => {
    expect(
      InteractionResponseSchema.safeParse(response({ selectedOptionIds: [], mappings: [] }))
        .success,
    ).toBe(false);
  });

  it('accepts a custom answer that was not among the suggestions', () => {
    // "The person provides a custom need absent from suggestions" is a
    // retained edge case, so `customText` alone is a complete response.
    const result = InteractionResponseSchema.safeParse(
      response({
        selectedOptionIds: [],
        customText: 'It has to fit a folded wheelchair in the boot',
        mappings: [
          {
            topicId: 'vehicle.cargo',
            valueSummary: 'Folded wheelchair must fit in the boot',
            origin: 'user',
            confidence: 1,
            requiresConfirmation: false,
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe('TopicMapping: a model-proposed blocker always requires confirmation', () => {
  const base = {
    topicId: 'vehicle.towing',
    valueSummary: 'Must tow a 3,500 lb trailer',
    origin: 'model',
    confidence: 0.8,
  };

  it('rejects a model-proposed must_work mapping that skips confirmation', () => {
    expect(
      TopicMappingSchema.safeParse({
        ...base,
        importance: 'must_work',
        requiresConfirmation: false,
      }).success,
    ).toBe(false);
  });

  it('accepts the same mapping when it asks to be confirmed', () => {
    expect(
      TopicMappingSchema.safeParse({
        ...base,
        importance: 'must_work',
        requiresConfirmation: true,
      }).success,
    ).toBe(true);
  });

  it('accepts a person stating their own blocker directly', () => {
    expect(
      TopicMappingSchema.safeParse({
        ...base,
        origin: 'user',
        confidence: 1,
        importance: 'must_work',
        requiresConfirmation: false,
      }).success,
    ).toBe(true);
  });
});

describe('NextMove: human-only authority is structural, not conventional', () => {
  function move(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      kind: 'discover_candidates',
      label: 'Discover models',
      reason: 'Every required topic is confirmed and the blind-spot review is done',
      humanOnly: false,
      mayInterruptHumanNavigation: false,
      ...overrides,
    };
  }

  it('accepts a normal model-callable move', () => {
    expect(NextMoveSchema.safeParse(move({ toolName: 'sift_discover_candidates' })).success).toBe(
      true,
    );
  });

  it.each(HUMAN_ONLY_MOVE_KINDS)('forces humanOnly for the %s move', (kind) => {
    expect(NextMoveSchema.safeParse(move({ kind, humanOnly: false })).success).toBe(false);
    expect(NextMoveSchema.safeParse(move({ kind, humanOnly: true })).success).toBe(true);
  });

  it('refuses to attach a tool to a human-only move', () => {
    // This is the rule that keeps `reviewProposal` off the WebMCP catalog
    // expressed one level lower: a human-only move has nowhere to put a
    // tool name, so no registration code can find one to expose.
    const result = NextMoveSchema.safeParse(
      move({ kind: 'confirm_shortlist', humanOnly: true, toolName: 'sift_confirm_shortlist' }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/human-only/i);
  });

  it('requires a topic id for a move that answers a topic', () => {
    expect(NextMoveSchema.safeParse(move({ kind: 'answer_topic' })).success).toBe(false);
    expect(
      NextMoveSchema.safeParse(move({ kind: 'answer_topic', topicId: 'vehicle.budget' })).success,
    ).toBe(true);
  });

  it('rejects a move naming a view outside the declared vocabulary', () => {
    expect(NextMoveSchema.safeParse(move({ requiredView: 'raw_html' })).success).toBe(false);
    expect(NextMoveSchema.safeParse(move({ requiredView: 'quick_pick' })).success).toBe(true);
  });
});

describe('CandidateProvenance: a model is not a listing', () => {
  it('accepts a model-level candidate discovered in the bundled catalog', () => {
    expect(
      CandidateProvenanceSchema.safeParse({
        level: 'model',
        source: 'catalog',
        catalogRecordId: 'epa-2022-toyota-rav4-hybrid-awd',
      }).success,
    ).toBe(true);
  });

  it('accepts a curated demo profile that says so', () => {
    expect(
      CandidateProvenanceSchema.safeParse({
        level: 'model',
        source: 'curated_demo',
        catalogRecordId: 'epa-2022-honda-cr-v-ex-l-awd',
        disclosure: 'Curated demo data: cargo dimensions and safety ratings are illustrative',
      }).success,
    ).toBe(true);
  });

  it('rejects a listing-level candidate with no listing provenance', () => {
    // The one claim this product must never make by accident: that a real
    // car, at a real dealer, at a real price, is available right now.
    const result = CandidateProvenanceSchema.safeParse({ level: 'listing', source: 'catalog' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/listing/i);
  });

  it('accepts a listing-level candidate carrying its full provenance', () => {
    expect(
      CandidateProvenanceSchema.safeParse({
        level: 'listing',
        source: 'user_supplied',
        listing: {
          listingId: 'listing-4471',
          seller: 'Northside Auto',
          observedAt: AT,
        },
      }).success,
    ).toBe(true);
  });

  it('rejects listing provenance attached to a model-level candidate', () => {
    const result = CandidateProvenanceSchema.safeParse({
      level: 'model',
      source: 'catalog',
      listing: { listingId: 'listing-4471', seller: 'Northside Auto', observedAt: AT },
    });
    expect(result.success).toBe(false);
  });
});

describe('CandidateDispositionRecord: Keep is durable and undoable, and is not approval', () => {
  it('accepts a Keep carrying what it replaced', () => {
    expect(
      CandidateDispositionRecordSchema.safeParse({
        entityId: 'candidate-rav4',
        disposition: 'keep',
        previousDisposition: 'unreviewed',
        decidedAt: AT,
      }).success,
    ).toBe(true);
  });

  it('accepts a Pass with the person`s own reason', () => {
    expect(
      CandidateDispositionRecordSchema.safeParse({
        entityId: 'candidate-outback',
        disposition: 'pass',
        previousDisposition: 'keep',
        reason: 'Too long for our garage',
        decidedAt: AT,
      }).success,
    ).toBe(true);
  });

  it('rejects a disposition outside the Keep/Pass/Unsure vocabulary', () => {
    // Notably `shortlisted` and `approved` are not dispositions. Quick Pick
    // triage is deliberately a different thing from shortlist confirmation.
    expect(
      CandidateDispositionRecordSchema.safeParse({
        entityId: 'candidate-rav4',
        disposition: 'shortlisted',
        previousDisposition: 'unreviewed',
        decidedAt: AT,
      }).success,
    ).toBe(false);
  });

  it('rejects a record that has no previous value to undo back to', () => {
    expect(
      CandidateDispositionRecordSchema.safeParse({
        entityId: 'candidate-rav4',
        disposition: 'keep',
        decidedAt: AT,
      }).success,
    ).toBe(false);
  });
});

describe('BlindSpotReviewState', () => {
  it('accepts a review that has been offered but not answered', () => {
    expect(
      BlindSpotReviewStateSchema.safeParse({
        status: 'offered',
        offeredPromptIds: ['blindspot.child_seats', 'blindspot.garage_clearance'],
        selectedPromptIds: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a complete review that was never offered anything', () => {
    const result = BlindSpotReviewStateSchema.safeParse({
      status: 'complete',
      offeredPromptIds: [],
      selectedPromptIds: [],
      acknowledgedAt: AT,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a selection that was never on offer', () => {
    expect(
      BlindSpotReviewStateSchema.safeParse({
        status: 'complete',
        offeredPromptIds: ['blindspot.child_seats'],
        selectedPromptIds: ['blindspot.towing'],
        acknowledgedAt: AT,
      }).success,
    ).toBe(false);
  });

  it('requires an acknowledgement timestamp once complete', () => {
    expect(
      BlindSpotReviewStateSchema.safeParse({
        status: 'complete',
        offeredPromptIds: ['blindspot.child_seats'],
        selectedPromptIds: [],
      }).success,
    ).toBe(false);
  });
});

describe('DiscoveryState: the persisted shape', () => {
  const state = {
    mode: 'companion',
    topics: [topic()],
    blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
    dispositions: [],
    pendingInteraction: null,
    updatedAt: AT,
  };

  it('accepts a fresh companion case', () => {
    expect(DiscoveryStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects two states for the same topic', () => {
    expect(DiscoveryStateSchema.safeParse({ ...state, topics: [topic(), topic()] }).success).toBe(
      false,
    );
  });

  it('rejects two dispositions for the same candidate, because only the latest is true', () => {
    const disposition = {
      entityId: 'candidate-rav4',
      disposition: 'keep',
      previousDisposition: 'unreviewed',
      decidedAt: AT,
    };
    expect(
      DiscoveryStateSchema.safeParse({ ...state, dispositions: [disposition, disposition] })
        .success,
    ).toBe(false);
  });

  it('carries the interaction currently on screen', () => {
    expect(
      DiscoveryStateSchema.safeParse({ ...state, pendingInteraction: interactionRequest() })
        .success,
    ).toBe(true);
  });
});

describe('pack discovery declarations', () => {
  function template(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'vehicle.occupants',
      label: 'Who and what has to fit',
      question: 'Who travels in this vehicle regularly, and what has to fit with them?',
      necessity: 'required',
      priority: 90,
      allowedInteractions: ['multi_select', 'free_text'],
      optionSeeds: [
        { id: 'seed.adults', label: 'Two adults', valueSummary: 'Two adults' },
        {
          id: 'seed.car_seats',
          label: 'Children in car seats',
          valueSummary: 'Children in car seats',
        },
      ],
      escapeHatches: { allowCustom: true, allowNone: false, allowUnsure: true, allowDefer: false },
      mapsToAttributeIds: [],
      mapsToCriterionIds: [],
      confirmationRequired: true,
      ...overrides,
    };
  }

  it('accepts a required topic template', () => {
    expect(DiscoveryTopicTemplateSchema.safeParse(template()).success).toBe(true);
  });

  it('accepts a conditional topic that only applies to a business case', () => {
    const result = DiscoveryTopicTemplateSchema.safeParse(
      template({
        id: 'vehicle.payload',
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'trade'] },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a required topic that offers a defer escape hatch', () => {
    // A required topic with a "Skip for now" button is exactly the hole the
    // companion journey is not allowed to have.
    const result = DiscoveryTopicTemplateSchema.safeParse(
      template({
        escapeHatches: { allowCustom: true, allowNone: false, allowUnsure: true, allowDefer: true },
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/defer/i);
  });

  it('allows a soft topic to be deferred', () => {
    expect(
      DiscoveryTopicTemplateSchema.safeParse(
        template({
          necessity: 'soft',
          escapeHatches: {
            allowCustom: true,
            allowNone: false,
            allowUnsure: true,
            allowDefer: true,
          },
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects a template declaring an interaction kind that does not exist', () => {
    expect(
      DiscoveryTopicTemplateSchema.safeParse(template({ allowedInteractions: ['freeform_html'] }))
        .success,
    ).toBe(false);
  });

  it('rejects a template with no allowed interaction at all', () => {
    expect(
      DiscoveryTopicTemplateSchema.safeParse(template({ allowedInteractions: [] })).success,
    ).toBe(false);
  });

  it('accepts a whole pack discovery definition', () => {
    const result = PackDiscoveryDefinitionSchema.safeParse({
      topics: [template()],
      blindSpots: [
        {
          id: 'blindspot.child_seats',
          label: 'Car seat layout',
          detail: 'Three across, or a rear-facing seat behind a tall driver',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate topic ids in one pack', () => {
    expect(
      PackDiscoveryDefinitionSchema.safeParse({ topics: [template(), template()], blindSpots: [] })
        .success,
    ).toBe(false);
  });

  it('rejects a condition pointing at a topic the pack never declares', () => {
    const result = PackDiscoveryDefinitionSchema.safeParse({
      topics: [template({ appliesWhen: { topicId: 'vehicle.nonexistent', equalsAnyOf: ['x'] } })],
      blindSpots: [],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/vehicle\.nonexistent/);
  });
});
