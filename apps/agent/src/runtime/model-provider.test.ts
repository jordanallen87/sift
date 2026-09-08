import { Agent, Message, tool } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { IdGenerator } from '@sift/core';
import {
  ScriptedModelProvider,
  createBedrockModel,
  resolveModelProvider,
} from './model-provider.js';

describe('ScriptedModelProvider config', () => {
  it('getConfig reflects the constructor modelId by default', () => {
    const provider = new ScriptedModelProvider({ beats: {} });
    expect(provider.getConfig().modelId).toBe('sift-scripted-model');
  });

  it('updateConfig merges into the existing config', () => {
    const provider = new ScriptedModelProvider({ beats: {} });
    provider.updateConfig({ temperature: 0.2 });
    expect(provider.getConfig()).toMatchObject({
      modelId: 'sift-scripted-model',
      temperature: 0.2,
    });
  });
});

describe('ScriptedModelProvider.stream error handling', () => {
  it('throws when stream() is called before setBeat()', async () => {
    const provider = new ScriptedModelProvider({ beats: { a: [{ text: 'hi' }] } });
    await expect(async () => {
      for await (const _event of provider.stream([])) {
        // draining is enough to trigger the throw
      }
    }).rejects.toThrow(/setBeat/);
  });

  it('throws for a beat with no registered queue', async () => {
    const provider = new ScriptedModelProvider({ beats: {} });
    provider.setBeat('unknown-beat');
    await expect(async () => {
      for await (const _event of provider.stream([])) {
        // draining is enough to trigger the throw
      }
    }).rejects.toThrow(/no scripted responses registered/);
  });

  it('throws once a beat queue is exhausted', async () => {
    const provider = new ScriptedModelProvider({ beats: { a: [{ text: 'first' }] } });
    provider.setBeat('a');
    for await (const _event of provider.stream([])) {
      // drain the one scripted turn
    }
    await expect(async () => {
      for await (const _event of provider.stream([])) {
        // second call has nothing left
      }
    }).rejects.toThrow(/exhausted/);
  });
});

describe('ScriptedModelProvider.stream text turn', () => {
  it('yields a real message-start/content/message-stop/metadata sequence ending endTurn', async () => {
    const provider = new ScriptedModelProvider({ beats: { greet: [{ text: 'hello there' }] } });
    provider.setBeat('greet');
    const events = [];
    for await (const event of provider.stream([])) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('modelMessageStartEvent');
    const textDeltaEvent = events.find((event) => event.type === 'modelContentBlockDeltaEvent');
    expect(textDeltaEvent?.type).toBe('modelContentBlockDeltaEvent');
    if (
      textDeltaEvent?.type === 'modelContentBlockDeltaEvent' &&
      textDeltaEvent.delta.type === 'textDelta'
    ) {
      expect(textDeltaEvent.delta.text).toBe('hello there');
    }
    const stopEvent = events.find((event) => event.type === 'modelMessageStopEvent');
    expect(stopEvent?.type === 'modelMessageStopEvent' && stopEvent.stopReason).toBe('endTurn');
    const metadataEvent = events.find((event) => event.type === 'modelMetadataEvent');
    expect(metadataEvent?.type).toBe('modelMetadataEvent');
  });

  it('records every call in callLog with the active beat and the exact messages sent', async () => {
    const provider = new ScriptedModelProvider({ beats: { greet: [{ text: 'hi' }] } });
    provider.setBeat('greet');
    const sentMessage = new Message({ role: 'user', content: [] });
    for await (const _event of provider.stream([sentMessage])) {
      // drain
    }
    expect(provider.callLog).toHaveLength(1);
    expect(provider.callLog[0]?.beat).toBe('greet');
    expect(provider.callLog[0]?.messages).toEqual([sentMessage]);
  });
});

describe('ScriptedModelProvider.stream tool-call turn', () => {
  it('yields a toolUse start/delta/stop sequence ending toolUse, with an auto-generated deterministic toolUseId', async () => {
    let counter = 0;
    const idGenerator: IdGenerator = { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
    const provider = new ScriptedModelProvider({
      beats: {
        investigate: [{ toolCalls: [{ name: 'listing-reader', input: { candidateId: 'rav4' } }] }],
      },
      idGenerator,
    });
    provider.setBeat('investigate');
    const events = [];
    for await (const event of provider.stream([])) {
      events.push(event);
    }
    const startEvent = events.find((event) => event.type === 'modelContentBlockStartEvent');
    expect(startEvent?.type === 'modelContentBlockStartEvent' && startEvent.start?.type).toBe(
      'toolUseStart',
    );
    expect(
      startEvent?.type === 'modelContentBlockStartEvent' &&
        startEvent.start?.type === 'toolUseStart' &&
        startEvent.start.toolUseId,
    ).toBe('scripted-tool-use-1');
    const stopEvent = events.find((event) => event.type === 'modelMessageStopEvent');
    expect(stopEvent?.type === 'modelMessageStopEvent' && stopEvent.stopReason).toBe('toolUse');
  });

  it('preserves an explicitly supplied toolUseId', async () => {
    const provider = new ScriptedModelProvider({
      beats: {
        investigate: [
          { toolCalls: [{ name: 'listing-reader', toolUseId: 'fixed-id', input: {} }] },
        ],
      },
    });
    provider.setBeat('investigate');
    const events = [];
    for await (const event of provider.stream([])) {
      events.push(event);
    }
    const startEvent = events.find((event) => event.type === 'modelContentBlockStartEvent');
    expect(
      startEvent?.type === 'modelContentBlockStartEvent' &&
        startEvent.start?.type === 'toolUseStart' &&
        startEvent.start.toolUseId,
    ).toBe('fixed-id');
  });
});

describe('ScriptedModelProvider driving a real Strands Agent end to end', () => {
  it('a real Agent calls the real scripted tool through the model-driven tool-use loop', async () => {
    const calls: string[] = [];
    const listingReaderTool = tool({
      name: 'listing-reader',
      description: 'test tool',
      inputSchema: z.object({ candidateId: z.string() }),
      callback: (input) => {
        calls.push(input.candidateId);
        return { advertisedPrice: 28000 };
      },
    });

    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'listing-reader', input: { candidateId: 'rav4' } }] },
          { text: 'The RAV4 is advertised at $28,000.' },
        ],
      },
    });
    provider.setBeat('turn');

    const agent = new Agent({ model: provider, tools: [listingReaderTool], printer: false });
    const result = await agent.invoke('What is the RAV4 advertised at?');

    expect(calls).toEqual(['rav4']);
    expect(result.stopReason).toBe('endTurn');
    expect(result.toString()).toContain('28,000');
  });
});

describe('createBedrockModel / resolveModelProvider', () => {
  it('createBedrockModel builds a real BedrockModel from Sift config', () => {
    const model = createBedrockModel({
      modelId: 'global.anthropic.claude-sonnet-4-6',
      awsRegion: 'us-east-1',
    });
    expect(model).toBeInstanceOf(BedrockModel);
    expect(model.getConfig().modelId).toBe('global.anthropic.claude-sonnet-4-6');
  });

  it('resolveModelProvider returns the scripted provider when one is supplied', () => {
    const scripted = new ScriptedModelProvider({ beats: {} });
    const resolved = resolveModelProvider({ modelId: 'unused', awsRegion: 'us-east-1' }, scripted);
    expect(resolved).toBe(scripted);
  });

  it('resolveModelProvider falls back to a real BedrockModel when no scripted provider is given', () => {
    const resolved = resolveModelProvider({
      modelId: 'global.anthropic.claude-sonnet-4-6',
      awsRegion: 'us-east-1',
    });
    expect(resolved).toBeInstanceOf(BedrockModel);
  });
});
