/**
 * The three people this product is for, written as scripted turns.
 *
 * These are not test data in the usual sense — they are the product's
 * claims about who it serves, in a form that fails. Each persona is chosen
 * because it stresses a different seam:
 *
 * - **Family novice** is the hero. Someone who has never bought a car this
 *   way, does not know what questions matter, and needs the pane to carry
 *   the whole load. If the harness only ever ran this one, the product
 *   could still be a single-path demo.
 * - **Landscaping owner** is the contrast beat. The *same pack*, a
 *   completely different set of questions — payload, upfit, downtime — and
 *   the divergence has to come from the person's answers rather than from a
 *   second hard-coded script. This is what proves the discovery is adaptive
 *   rather than staged.
 * - **Known-listing shopper** arrives with a specific vehicle already in
 *   mind. It is the convergence case, and the one where the product is most
 *   tempted to fabricate: a real listing has a price and a seller, and Sift
 *   has neither. The persona exists to make sure that stays an explicit
 *   unknown.
 *
 * Turn labels are what appears in a failure report, so each says what the
 * person is trying to do rather than which command runs.
 */
import { PersonaSchema, type Persona } from '@sift/contracts';

/**
 * The family journey, start to shortlist. The novice hero: every question
 * comes from the pack's discovery, and nothing about the route is hard-coded
 * into the persona beyond the answers a person would actually give.
 */
const FAMILY_NOVICE: Persona = PersonaSchema.parse({
  id: 'family-novice',
  title: 'Family novice',
  goal: 'Replace an ageing family car without knowing what questions to ask.',
  packId: 'car-purchase',
  demoId: 'car-purchase',
  mode: 'companion',
  turns: [
    {
      label: 'Ask for help choosing a car',
      actor: 'human',
      utterance: 'We need a new family car.',
    },
    {
      label: 'Say what the car is for',
      actor: 'human',
      utterance: 'Mostly school runs and a long trip a few times a year.',
      command: 'updateDiscovery',
    },
    {
      label: 'Give a budget',
      actor: 'human',
      utterance: 'Under about thirty-five thousand.',
      command: 'updateDiscovery',
    },
    {
      label: 'Answer how many people it carries',
      actor: 'human',
      utterance: 'Two adults, two kids, one still in a car seat.',
      command: 'updateDiscovery',
    },
    {
      label: 'Finish the check for anything missed',
      actor: 'human',
      command: 'completeBlindSpotReview',
    },
    { label: 'See what Sift found', actor: 'human' },
    { label: 'Keep the first option', actor: 'human', command: 'setCandidateDisposition' },
    { label: 'Pass on the second option', actor: 'human', command: 'setCandidateDisposition' },
    {
      label: 'Raise a concern nobody asked about',
      actor: 'human',
      utterance: 'Will a dog crate fit behind the back seats?',
      command: 'defineCaseAttribute',
    },
    { label: 'Watch Sift revise what it is looking into', actor: 'human' },
    { label: 'Review where things stand', actor: 'human' },
  ],
});

/**
 * The contrast beat, deliberately short. Proving the divergence is real
 * needs only enough turns to show a different question set arriving from
 * the same pack.
 */
const LANDSCAPING_OWNER: Persona = PersonaSchema.parse({
  id: 'landscaping-owner',
  title: 'Landscaping business owner',
  goal: 'Add a work vehicle that can tow a trailer and survive a worksite.',
  packId: 'car-purchase',
  demoId: 'car-purchase',
  mode: 'companion',
  turns: [
    {
      label: 'Ask for help choosing a work vehicle',
      actor: 'human',
      utterance: 'I need another truck for the landscaping business.',
    },
    {
      label: 'Say it is for the business, not the family',
      actor: 'human',
      utterance: 'It is for work — crews, tools, and a trailer.',
      command: 'updateDiscovery',
    },
    {
      label: 'Answer a question the family journey never sees',
      actor: 'human',
      utterance: 'It has to tow about seven thousand pounds.',
      command: 'updateDiscovery',
    },
    {
      label: 'Say what downtime would cost',
      actor: 'human',
      utterance: 'If it is off the road for a week I lose jobs.',
      command: 'updateDiscovery',
    },
    { label: 'See a different set of options', actor: 'human' },
  ],
});

/**
 * The convergence case. Someone who already found a specific vehicle and
 * wants to know whether it is right, which is where fabricating a price or
 * a seller would be easiest and most damaging.
 */
const KNOWN_LISTING_SHOPPER: Persona = PersonaSchema.parse({
  id: 'known-listing-shopper',
  title: 'Known-listing shopper',
  goal: 'Check whether a specific vehicle they already found is the right choice.',
  packId: 'car-purchase',
  demoId: 'car-purchase',
  mode: 'companion',
  turns: [
    {
      label: 'Arrive with a specific vehicle in mind',
      actor: 'human',
      utterance: 'I am looking at a RAV4 Hybrid. Is it the right call?',
      command: 'upsertOption',
    },
    {
      label: 'Say what it is for',
      actor: 'human',
      utterance: 'Family car, mostly city driving.',
      command: 'updateDiscovery',
    },
    {
      label: 'Keep it while Sift looks into it',
      actor: 'human',
      command: 'setCandidateDisposition',
    },
    { label: 'Read what Sift can and cannot say about it', actor: 'human' },
  ],
});

export const PERSONAS: readonly Persona[] = [
  FAMILY_NOVICE,
  LANDSCAPING_OWNER,
  KNOWN_LISTING_SHOPPER,
];

export function personaById(id: Persona['id']): Persona {
  const persona = PERSONAS.find((entry) => entry.id === id);
  if (persona === undefined) {
    throw new Error(`No persona is defined for id "${id}".`);
  }
  return persona;
}
