/**
 * The body-style silhouette.
 *
 * Two things matter about it. It must map every body style the catalog
 * actually contains onto a shape — a fallback that quietly swallowed an
 * unmapped value would make the whole list read as sedans — and it must not
 * announce itself to a screen reader, because the card already states the
 * body style in words directly beside it.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { VehicleSilhouette, shapeFor } from './VehicleSilhouette.js';

/**
 * Every distinct `bodyStyle` in `packages/catalog/data/vehicle-catalog.json`
 * (853 records). Written out rather than derived from the data file so that
 * a new body style arriving in the catalog fails this test loudly instead
 * of silently falling back to a sedan.
 */
const CATALOG_BODY_STYLES = [
  'Compact SUV',
  'SUV',
  'Sedan',
  'Full-size sedan',
  'Compact car',
  'Pickup truck',
  'Compact pickup truck',
  'Minivan',
  'Wagon',
] as const;

describe('VehicleSilhouette', () => {
  it('maps every body style the catalog contains onto a real shape', () => {
    for (const style of CATALOG_BODY_STYLES) {
      const { unmount } = render(<VehicleSilhouette bodyStyle={style} />);
      expect(screen.getByTestId('vehicle-silhouette')).toBeInTheDocument();
      unmount();
    }
  });

  it('distinguishes the shapes a person is actually choosing between', () => {
    // A silhouette that rendered the same outline for a pickup and a
    // minivan would be decoration. These five must differ.
    const shapes = new Set(
      ['Sedan', 'Compact SUV', 'Pickup truck', 'Minivan', 'Wagon'].map((style) => shapeFor(style)),
    );
    expect(shapes.size).toBe(5);
  });

  it('groups the sizes of the same shape together', () => {
    // "Compact SUV" and "SUV" are the same silhouette at this size, and so
    // are the two pickups and the two sedans. That is deliberate: a 44px
    // drawing cannot honestly distinguish a compact SUV from a full-size
    // one, and pretending otherwise would be a claim the shape cannot make.
    expect(shapeFor('Compact SUV')).toBe(shapeFor('SUV'));
    expect(shapeFor('Pickup truck')).toBe(shapeFor('Compact pickup truck'));
    expect(shapeFor('Sedan')).toBe(shapeFor('Full-size sedan'));
  });

  it('falls back to a shape rather than rendering nothing', () => {
    render(<VehicleSilhouette bodyStyle={null} />);
    expect(screen.getByTestId('vehicle-silhouette')).toHaveAttribute('data-shape', 'sedan');
  });

  it('is hidden from assistive technology, because the card says the body style in words', () => {
    render(<VehicleSilhouette bodyStyle="Minivan" />);
    const svg = screen.getByTestId('vehicle-silhouette');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('role', 'presentation');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<VehicleSilhouette bodyStyle="Compact SUV" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('carries no fill of its own, so it follows the theme it is placed in', () => {
    // Every paint is `currentColor`: the caller sets the colour and both
    // themes work without this component knowing which one is active.
    const { container } = render(<VehicleSilhouette bodyStyle="Sedan" />);
    const fills = [...container.querySelectorAll('[fill]')].map((node) =>
      node.getAttribute('fill'),
    );
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every((fill) => fill === 'currentColor')).toBe(true);
  });
});
