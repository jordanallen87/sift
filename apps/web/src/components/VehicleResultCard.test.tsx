/**
 * Behavioural coverage for the compact catalog row.
 *
 * The assertions that matter here are the ones about the two-actions-one-row
 * problem: that the row opens the detail sheet, that the Add button does
 * *not*, and that neither control is nested inside the other. A regression
 * to a wrapped, clickable card would still look identical and would still
 * pass a naive "it renders" test.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { buildVehicleCatalogRecord } from '@sift/catalog/test-support';
import { VehicleResultCard, vehicleSpecs } from './VehicleResultCard.js';

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
  annualFuelCostUsd: 1450,
});

function renderCard(overrides: Partial<React.ComponentProps<typeof VehicleResultCard>> = {}) {
  const onAdd = vi.fn();
  const onOpenDetails = vi.fn();
  render(
    <ul>
      <VehicleResultCard
        vehicle={RAV4}
        added={false}
        atCapacity={false}
        onAdd={onAdd}
        onOpenDetails={onOpenDetails}
        {...overrides}
      />
    </ul>,
  );
  return { onAdd, onOpenDetails };
}

describe('VehicleResultCard', () => {
  it('names the vehicle', () => {
    renderCard();
    expect(screen.getByTestId('vehicle-card-veh-rav4')).toHaveTextContent(
      '2022 Toyota RAV4 XLE Hybrid AWD',
    );
  });

  it('opens the detail sheet from the row', async () => {
    const { onOpenDetails } = renderCard();
    await userEvent.click(screen.getByTestId('vehicle-details-veh-rav4'));
    expect(onOpenDetails).toHaveBeenCalledWith(RAV4);
  });

  it('adds without opening the detail sheet', async () => {
    // The whole point of the stretched-pseudo-element pattern: no
    // `stopPropagation` anywhere, and the Add click is still only an add.
    const { onAdd, onOpenDetails } = renderCard();
    await userEvent.click(screen.getByTestId('vehicle-add-veh-rav4'));
    expect(onAdd).toHaveBeenCalledWith(RAV4);
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it('never nests one control inside the other', () => {
    renderCard();
    const details = screen.getByTestId('vehicle-details-veh-rav4');
    const add = screen.getByTestId('vehicle-add-veh-rav4');
    expect(details.querySelector('button')).toBeNull();
    expect(add.querySelector('button')).toBeNull();
    expect(details.contains(add)).toBe(false);
    expect(add.contains(details)).toBe(false);
  });

  it('gives each control an accessible name about the vehicle, not the whole row', () => {
    renderCard();
    // The row's own text -- title plus spec line -- is NOT the name; a
    // wrapped card would produce "2022 Toyota RAV4 ... Sport utility
    // vehicle AWD 40 MPG Add" here.
    const details = screen.getByRole('button', {
      name: '2022 Toyota RAV4 XLE Hybrid AWD — see full details',
    });
    expect(details).toHaveAttribute('data-testid', 'vehicle-details-veh-rav4');
    expect(
      screen.getByRole('button', { name: 'Add 2022 Toyota RAV4 XLE Hybrid AWD to your shortlist' }),
    ).toBeVisible();
  });

  it('reaches both controls by keyboard, in reading order', async () => {
    renderCard();
    await userEvent.tab();
    expect(screen.getByTestId('vehicle-details-veh-rav4')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId('vehicle-add-veh-rav4')).toHaveFocus();
  });

  it('reports a vehicle already on the shortlist and refuses to add it twice', async () => {
    const { onAdd } = renderCard({ added: true });
    const add = screen.getByTestId('vehicle-add-veh-rav4');
    expect(add).toHaveTextContent('Added');
    expect(add).toBeDisabled();
    await userEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('blocks adding once the shortlist is full, while still opening details', async () => {
    const { onAdd, onOpenDetails } = renderCard({ atCapacity: true });
    expect(screen.getByTestId('vehicle-add-veh-rav4')).toBeDisabled();
    await userEvent.click(screen.getByTestId('vehicle-details-veh-rav4'));
    expect(onOpenDetails).toHaveBeenCalledOnce();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('keeps the spec line to three facts, so it cannot truncate mid-fact', () => {
    expect(vehicleSpecs(RAV4)).toHaveLength(3);
    expect(vehicleSpecs(RAV4)).toEqual(['Sport utility vehicle', 'AWD', '40 MPG']);
  });

  it('omits a spec the catalog does not know rather than padding the line', () => {
    expect(
      vehicleSpecs(
        buildVehicleCatalogRecord({ bodyStyle: 'Wagon', drivetrain: null, combinedMpg: null }),
      ),
    ).toEqual(['Wagon']);
  });

  it('renders a record with no specs at all without an empty description', () => {
    renderCard({
      vehicle: buildVehicleCatalogRecord({
        id: 'veh-bare',
        bodyStyle: null,
        drivetrain: null,
        combinedMpg: null,
      }),
    });
    expect(screen.getByTestId('vehicle-card-veh-bare').querySelector('p')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <main>
        <ul>
          <VehicleResultCard
            vehicle={RAV4}
            added={false}
            atCapacity={false}
            onAdd={vi.fn()}
            onOpenDetails={vi.fn()}
          />
        </ul>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
