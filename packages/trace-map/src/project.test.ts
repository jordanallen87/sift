import { describe, expect, it } from 'vitest';
import { projectRunMap, type RunMapDefinition, type TraceSignal } from './index.js';

const definition: RunMapDefinition = {
  stages: [
    { id: 'webmcp', label: 'WebMCP command', match: { origins: ['webmcp'] } },
    { id: 'skills', label: 'Skills activated', match: { names: ['skill.activated'] } },
    { id: 'tools', label: 'Tools ran', match: { namePrefixes: ['tool.'] } },
  ],
};

const signals: TraceSignal[] = [
  {
    id: '1',
    sequence: 1,
    type: 'activity',
    name: 'case.updated',
    origin: 'webmcp',
    summary: 'Updated view.',
  },
  {
    id: '2',
    sequence: 2,
    type: 'runtime',
    name: 'skill.activated',
    summary: 'Activated household fit.',
  },
  {
    id: '3',
    sequence: 3,
    type: 'runtime',
    name: 'tool.lookup',
    status: 'completed',
    summary: 'Lookup complete.',
  },
  { id: '4', sequence: 4, type: 'runtime', name: 'unknown', status: 'failed', summary: 'Ignored.' },
];

describe('projectRunMap', () => {
  it('matches signals in sequence order and preserves drill-down ids', () => {
    const model = projectRunMap(definition, signals);
    expect(model.stages.map((stage) => [stage.id, stage.status, stage.signalIds])).toEqual([
      ['webmcp', 'completed', ['1']],
      ['skills', 'completed', ['2']],
      ['tools', 'completed', ['3']],
    ]);
  });

  it('uses failed over active/completed and leaves unknown signals alone', () => {
    const model = projectRunMap(definition, [
      ...signals,
      {
        id: '5',
        sequence: 5,
        type: 'runtime',
        name: 'tool.lookup',
        status: 'failed',
        summary: 'Tool failed.',
      },
    ]);
    expect(model.stages[2]).toMatchObject({ status: 'failed', signalIds: ['3', '5'] });
  });
});
