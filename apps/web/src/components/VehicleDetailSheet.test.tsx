/**
 * Behavioural coverage for the vehicle detail sheet.
 *
 * `vehicle-detail-fields.test.ts` proves which fields survive into the
 * groups; this file proves the panel around them -- that it names itself for
 * assistive technology, that its one action reports the right state, and
 * that a full shortlist explains itself instead of just going dim.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildVehicleCatalogRecord } from '@sift/catalog/test-support';
import { VehicleDetailSheet } from './VehicleDetailSheet.js';

const RAV4 = buildVehicleCatalogRecord({
  id: 'veh-rav4',
  year: 2022,
  make: 'Toyota',
  model: 'RAV4',
  trim: 'XLE Hybrid AWD',
  bodyStyle: 'Sport utility vehicle',
  drivetrain: 'AWD',
  fuelType: 'Hybrid',
  combinedMpg: 40,
  transmission: '8-speed automatic',
});

function renderSheet(overrides: Partial<React.ComponentProps<typeof VehicleDetailSheet>> = {}) {
  const onToggleShortlist = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <VehicleDetailSheet
      vehicle={RAV4}
      open
      onOpenChange={onOpenChange}
      inShortlist={false}
      shortlistFull={false}
      onToggleShortlist={onToggleShortlist}
      {...overrides}
    />,
  );
  return { onToggleShortlist, onOpenChange };
}

describe('VehicleDetailSheet', () => {
  it('renders nothing without a vehicle', () => {
    renderSheet({ vehicle: null });
    expect(screen.queryByTestId('vehicle-detail-sheet')).toBeNull();
  });

  it('names itself with the vehicle, so the dialog is identifiable when it opens', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: /2022 Toyota RAV4 XLE Hybrid AWD/ })).toBeVisible();
  });

  it('shows fields the browse row never had room for', () => {
    renderSheet();
    expect(screen.getByText('Transmission')).toBeVisible();
    expect(screen.getByText('8-speed automatic')).toBeVisible();
  });

  it('groups the spec sheet rather than listing 80 fields flat', () => {
    renderSheet();
    expect(screen.getByTestId('vehicle-detail-group-powertrain')).toBeVisible();
    expect(screen.getByTestId('vehicle-detail-group-provenance')).toBeVisible();
  });

  it('offers to add a vehicle that is not shortlisted', async () => {
    const { onToggleShortlist } = renderSheet();
    const toggle = screen.getByTestId('vehicle-detail-shortlist-toggle');
    expect(toggle).toHaveTextContent('Add to shortlist');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(onToggleShortlist).toHaveBeenCalledWith(RAV4);
  });

  it('reports shortlist membership as pressed state, not just a different label', () => {
    renderSheet({ inShortlist: true });
    const toggle = screen.getByTestId('vehicle-detail-shortlist-toggle');
    expect(toggle).toHaveTextContent('Remove from shortlist');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains a full shortlist instead of only disabling the button', () => {
    renderSheet({ shortlistFull: true });
    expect(screen.getByTestId('vehicle-detail-shortlist-toggle')).toBeDisabled();
    expect(screen.getByTestId('vehicle-detail-shortlist-full')).toHaveTextContent(
      'Shortlist is full',
    );
  });

  it('still allows removing when the shortlist is full', async () => {
    const { onToggleShortlist } = renderSheet({ inShortlist: true, shortlistFull: true });
    const toggle = screen.getByTestId('vehicle-detail-shortlist-toggle');
    expect(toggle).toBeEnabled();
    await userEvent.click(toggle);
    expect(onToggleShortlist).toHaveBeenCalledWith(RAV4);
    expect(screen.queryByTestId('vehicle-detail-shortlist-full')).toBeNull();
  });

  it('closes on Escape', async () => {
    const { onOpenChange } = renderSheet();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('omits a group the catalog cannot populate at all', () => {
    renderSheet({
      vehicle: buildVehicleCatalogRecord({
        electricRangeMiles: null,
        combinedKwhPer100Mi: null,
        charge120Hours: null,
        charge240Hours: null,
        charger240Description: null,
        combinedUtilityFactor: null,
      }),
    });
    expect(screen.queryByTestId('vehicle-detail-group-electric')).toBeNull();
  });
});
