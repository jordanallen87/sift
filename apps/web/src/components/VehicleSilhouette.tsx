/**
 * A body-style silhouette for a vehicle card.
 *
 * ## Why a silhouette and not a photograph
 *
 * The catalog is 853 vehicles built from the EPA's public fueleconomy.gov
 * dataset (`docs/reuse-attribution.md`), which carries specifications and
 * no imagery. Photographs would mean either bundling licensed images for
 * 853 vehicles, or fetching them at runtime — and CLAUDE.md requires
 * fixture mode to "execute the complete product without network access
 * after installation". A silhouette drawn here is offline by construction,
 * costs no request, and carries no licence.
 *
 * It is also more honest. A photograph of a specific trim next to
 * `curated_demo` figures invites a person to read the whole card as
 * real-world fact. A silhouette says "this is the shape of thing you are
 * looking at" and claims nothing about the individual vehicle.
 *
 * ## Why it is information, not decoration
 *
 * Body style is a real, filterable catalog field, and the thing a person
 * scanning a long result list is usually sorting by. Rendering it as a
 * shape means the list can be read at a glance instead of parsed. That is
 * the only reason this exists — a purely decorative image would be
 * bytes and noise.
 *
 * Because it repeats information already written in the card's spec line
 * ("Compact SUV · AWD · Hybrid"), it is `aria-hidden`: a screen reader
 * announcing "sport utility vehicle silhouette" directly before the words
 * "Compact SUV" is noise, not access.
 */

/** The nine `bodyStyle` values the catalog actually contains. */
const SHAPE_BY_BODY_STYLE: Record<string, ShapeKey> = {
  'Compact SUV': 'suv',
  SUV: 'suv',
  Sedan: 'sedan',
  'Full-size sedan': 'sedan',
  'Compact car': 'compact',
  'Pickup truck': 'pickup',
  'Compact pickup truck': 'pickup',
  Minivan: 'minivan',
  Wagon: 'wagon',
};

type ShapeKey = 'suv' | 'sedan' | 'compact' | 'pickup' | 'minivan' | 'wagon';

/**
 * Side profiles, nose to the right, on a shared 64x32 grid with the wheels
 * on a common axle line so the shapes read as one family rather than six
 * unrelated drawings.
 */
const SHAPES: Record<ShapeKey, { body: string; wheels: [number, number] }> = {
  // Upright greenhouse, high roofline, short overhangs.
  suv: {
    body: 'M3 25 L3 18 Q3 15 7 14 L19 14 L23 6 Q24 4 28 4 L46 4 Q50 4 51 6 L55 14 L58 15 Q61 16 61 19 L61 25 Z',
    wheels: [17, 47],
  },
  // Three-box: boot, cabin set back, long bonnet.
  sedan: {
    body: 'M3 25 L3 19 Q3 16 7 15 L20 15 L27 8 Q29 6 33 6 L43 6 Q47 6 48 8 L53 15 L58 16 Q61 17 61 20 L61 25 Z',
    wheels: [16, 48],
  },
  // Shorter overall, steeper hatch, cabin further forward.
  compact: {
    body: 'M7 25 L7 18 Q7 15 11 14 L18 14 L24 7 Q26 5 30 5 L41 5 Q44 5 45 7 L49 14 L53 15 Q57 16 57 19 L57 25 Z',
    wheels: [18, 46],
  },
  // Cab forward, open bed behind it.
  pickup: {
    body: 'M3 25 L3 15 L33 15 L33 9 Q33 6 37 5 L47 5 Q51 5 53 8 L57 14 Q61 15 61 18 L61 25 Z',
    wheels: [15, 47],
  },
  // One long box, sloping nose, tallest roof.
  minivan: {
    body: 'M3 25 L3 14 Q3 9 9 8 L42 8 Q49 9 54 14 L57 16 Q61 17 61 20 L61 25 Z',
    wheels: [16, 47],
  },
  // Sedan nose with the roof carried to the tail.
  wagon: {
    body: 'M3 25 L3 17 Q3 14 6 13 L13 13 L13 7 Q13 5 17 5 L40 5 Q44 5 46 7 L52 14 L58 16 Q61 17 61 20 L61 25 Z',
    wheels: [16, 48],
  },
};

/** Falls back to the most common shape rather than rendering nothing. */
export function shapeFor(bodyStyle: string | null | undefined): ShapeKey {
  if (bodyStyle === null || bodyStyle === undefined) return 'sedan';
  return SHAPE_BY_BODY_STYLE[bodyStyle] ?? 'sedan';
}

export interface VehicleSilhouetteProps {
  /** The catalog's own `bodyStyle` string. Unknown values fall back to a sedan. */
  readonly bodyStyle: string | null | undefined;
  readonly className?: string;
}

export function VehicleSilhouette({
  bodyStyle,
  className,
}: VehicleSilhouetteProps): React.JSX.Element {
  const shape = SHAPES[shapeFor(bodyStyle)];

  return (
    <svg
      viewBox="0 0 64 32"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-testid="vehicle-silhouette"
      data-shape={shapeFor(bodyStyle)}
      className={className}
    >
      {/* Currentcolor throughout, so the caller places it in the type scale
          and it follows the theme without this component knowing which
          theme is active. */}
      <path d={shape.body} fill="currentColor" opacity="0.28" />
      {shape.wheels.map((cx) => (
        <circle key={cx} cx={cx} cy={25} r={5} fill="currentColor" opacity="0.55" />
      ))}
      {shape.wheels.map((cx) => (
        <circle key={`hub-${String(cx)}`} cx={cx} cy={25} r={2} fill="currentColor" opacity="0.2" />
      ))}
    </svg>
  );
}
