---
layout: home

hero:
  name: '@ocash/sdk'
  text: Privacy-Preserving Token SDK
  tagline: TypeScript ZKP SDK for deposit, transfer, and withdrawal via UTXO model and zk-SNARK proofs
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/sdk

features:
  - title: Zero-Knowledge Proofs
    details: Built on zk-SNARK circuits (Go WASM) for on-chain privacy. Transfer and withdraw without revealing sender, receiver, or amounts.
  - title: UTXO Model
    details: Uses an unspent transaction output model with Poseidon2 commitments, Merkle trees, and nullifiers for state management.
  - title: Multi-Environment
    details: Works in browsers, Node.js, and hybrid containers (Electron/Tauri). Three entry points with environment-specific storage adapters.
  - title: Modular Architecture
    details: Factory pattern with event-driven modules — core, wallet, sync, planner, ops, and more. Compose what you need.
---
