import { describe, expect, it } from 'vitest';
import { renderAtNarrowWidth } from './narrow-viewport.js';

describe('renderAtNarrowWidth', () => {
  it('reports no risks for content with no fixed width wider than the container', () => {
    const { overflowRisks } = renderAtNarrowWidth(<div className="max-w-[480px]">fine</div>);
    expect(overflowRisks).toEqual([]);
  });

  it('flags a Tailwind arbitrary exact width wider than the max', () => {
    const { overflowRisks } = renderAtNarrowWidth(<div className="w-[500px]">too wide</div>);
    expect(overflowRisks).toEqual(['class: w-[500px]']);
  });

  it('flags a Tailwind arbitrary min-width wider than the max', () => {
    const { overflowRisks } = renderAtNarrowWidth(<div className="min-w-[420px]">too wide</div>);
    expect(overflowRisks).toEqual(['class: min-w-[420px]']);
  });

  it('flags an inline min-width style wider than the max', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <div style={{ minWidth: '600px' }}>too wide</div>,
    );
    expect(overflowRisks).toEqual(['inline style: min-width: 600px']);
  });

  it('does not flag max-width, in either inline style or arbitrary-value form', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <div className="max-w-[480px]" style={{ maxWidth: '480px' }}>
        fine
      </div>,
    );
    expect(overflowRisks).toEqual([]);
  });

  it('respects a custom maxWidthPx', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <div className="w-[440px]">fine at 480</div>,
      480,
    );
    expect(overflowRisks).toEqual([]);
  });
});
