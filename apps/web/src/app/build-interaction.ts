/**
 * Turns a pack's declared topic into the interaction a person answers.
 *
 * ## Why the deterministic core builds this, not the model
 *
 * Everything in an `InteractionRequest` comes from the compiled pack: the
 * prompt is the topic's own question, the options are its declared seeds,
 * the escape hatches are the ones the topic allows. Nothing here is
 * generated, and there is nowhere for a model to inject a prompt, an
 * option, or an escape a topic did not declare — which is what makes the
 * bounded interaction grammar bounded rather than merely documented.
 *
 * A model can still *ask* for an interaction through
 * `sift_request_interaction`; it supplies a topic id, and this is what
 * builds what appears on screen.
 *
 * ## Why this exists at all
 *
 * The adaptive discovery experience had no input path in the running
 * product. `DiscoveryInteraction` was built and tested, `requestInteraction`
 * and `submitInteractionResponse` were implemented, and the dock rendered
 * the next question as a button that only switched views. A person could
 * not answer a question in the pane. The persona harness never caught it,
 * because it calls commands directly.
 */
import type {
  CompiledDecisionPack,
  DiscoveryTopicTemplate,
  InteractionKind,
  InteractionRequest,
} from '@sift/contracts';

/**
 * The interaction kind to use for a topic.
 *
 * A topic declares which kinds it allows, in preference order. Taking the
 * first is deliberate: the pack author chose that order, and second-guessing
 * it here would put presentation decisions in two places.
 */
function kindFor(template: DiscoveryTopicTemplate): InteractionKind {
  const [first] = template.allowedInteractions;
  if (first === undefined) {
    throw new Error(`Topic "${template.id}" declares no allowed interaction kinds.`);
  }
  return first;
}

export interface BuildInteractionParams {
  readonly pack: CompiledDecisionPack;
  readonly topicId: string;
  readonly id: string;
  readonly now: string;
}

/**
 * Builds the request for one topic, or `null` when the pack does not
 * declare that topic — a missing topic is a stale next-move, not an
 * occasion to invent a question.
 */
export function buildInteractionForTopic({
  pack,
  topicId,
  id,
  now,
}: BuildInteractionParams): InteractionRequest | null {
  const template = (pack.discovery?.topics ?? []).find((entry) => entry.id === topicId);
  if (template === undefined) return null;

  const kind = kindFor(template);
  const options = template.optionSeeds.map((seed) => ({
    id: seed.id,
    label: seed.label,
    // The seed's own `detail`, carried straight through under the same
    // name the interaction grammar uses. An earlier version emitted
    // `helpText` here and `InteractionOptionSchema.strict()` rejected the
    // whole request -- correctly, and silently, because the failure was
    // swallowed by a bare `.catch`.
    ...(seed.detail === undefined ? {} : { detail: seed.detail }),
    // Every option writes to the topic it came from, and to nothing else.
    // `InteractionRequestSchema` refuses an option that maps outside
    // `topicIds`, so this is the only mapping that can be expressed.
    mapsTo: [{ topicId: template.id, valueSummary: seed.valueSummary }],
  }));

  return {
    id,
    topicIds: [template.id],
    kind,
    prompt: template.question,
    // A topic declares a question, not help text; the interaction's
    // `helpText` stays absent rather than repeating the prompt.
    options,
    escapeHatches: template.escapeHatches,
    // `core`, not `model`: the deterministic core assembled this from the
    // pack, whoever asked for it.
    requestedBy: 'core',
    createdAt: now,
  };
}
