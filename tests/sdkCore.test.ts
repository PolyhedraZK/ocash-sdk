import { describe, expect, it, vi } from 'vitest';
import { SdkCore } from '../src/core/sdk-core';
import type { OCashSdkConfig, ProofBridge } from '../src/types';
import { createProofBridgeMock } from './helpers';

const createCore = (bridge: ProofBridge, onEvent = vi.fn(), config?: Partial<OCashSdkConfig>) =>
  new SdkCore({ chains: [], onEvent, ...(config ?? {}) } as OCashSdkConfig, bridge);

describe('SdkCore.ready', () => {
  it('initializes the bridge exactly once and emits progress events', async () => {
    const bridgeMock = createProofBridgeMock();
    bridgeMock.init.mockResolvedValue(undefined);
    bridgeMock.initTransfer.mockResolvedValue(undefined);
    bridgeMock.initWithdraw.mockResolvedValue(undefined);
    const typedBridge = bridgeMock as unknown as ProofBridge;
    const onEvent = vi.fn();
    const core = createCore(typedBridge, onEvent);
    const progress = vi.fn();
    await core.ready(progress);
    expect(progress.mock.calls.map((call) => call[0])).toEqual([0.1, 0.4, 1]);
    expect(bridgeMock.init).toHaveBeenCalledTimes(1);
    expect(bridgeMock.initTransfer).toHaveBeenCalledTimes(1);
    expect(bridgeMock.initWithdraw).toHaveBeenCalledTimes(1);
    const eventTypes = onEvent.mock.calls.map((call) => call[0].type);
    expect(eventTypes.filter((type) => type === 'core:progress')).toHaveLength(3);
    expect(eventTypes.at(-1)).toBe('core:ready');
    expect(onEvent.mock.calls.at(-1)?.[0].payload.assetsVersion).toBe('none');

    await core.ready();
    expect(bridgeMock.init).toHaveBeenCalledTimes(1);
  });

  it('runs the initialization flow again after reset', async () => {
    const bridgeMock = createProofBridgeMock();
    bridgeMock.init.mockResolvedValue(undefined);
    bridgeMock.initTransfer.mockResolvedValue(undefined);
    bridgeMock.initWithdraw.mockResolvedValue(undefined);
    const core = createCore(bridgeMock as unknown as ProofBridge);
    await core.ready();
    core.reset();
    await core.ready();
    expect(bridgeMock.init).toHaveBeenCalledTimes(2);
    expect(bridgeMock.initTransfer).toHaveBeenCalledTimes(2);
    expect(bridgeMock.initWithdraw).toHaveBeenCalledTimes(2);
  });

  it('computes a stable assetsVersion from assetsOverride', async () => {
    const bridgeMock = createProofBridgeMock();
    bridgeMock.init.mockResolvedValue(undefined);
    bridgeMock.initTransfer.mockResolvedValue(undefined);
    bridgeMock.initWithdraw.mockResolvedValue(undefined);

    const onEventA = vi.fn();
    const coreA = createCore(bridgeMock as unknown as ProofBridge, onEventA, {
      assetsOverride: { 'app.wasm': 'https://cdn.example/a', 'wasm_exec.js': 'https://cdn.example/b' },
    });
    await coreA.ready();
    const versionA = onEventA.mock.calls.at(-1)?.[0].payload.assetsVersion as string;
    expect(versionA.startsWith('sha256:')).toBe(true);

    const onEventB = vi.fn();
    const coreB = createCore(bridgeMock as unknown as ProofBridge, onEventB, {
      assetsOverride: { 'wasm_exec.js': 'https://cdn.example/b', 'app.wasm': 'https://cdn.example/a' },
    });
    await coreB.ready();
    const versionB = onEventB.mock.calls.at(-1)?.[0].payload.assetsVersion as string;

    expect(versionB).toBe(versionA);
  });
});
