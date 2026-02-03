import { vi } from 'vitest';

export const createProofBridgeMock = () => ({
  init: vi.fn(),
  initTransfer: vi.fn(),
  initWithdraw: vi.fn(),
  proveTransfer: vi.fn(),
  proveWithdraw: vi.fn(),
  createMemo: vi.fn(),
  decryptMemo: vi.fn(),
  commitment: vi.fn(),
  nullifier: vi.fn(),
  createDummyRecordOpening: vi.fn(),
  createDummyInputSecret: vi.fn(),
});

export type ProofBridgeMock = ReturnType<typeof createProofBridgeMock>;
