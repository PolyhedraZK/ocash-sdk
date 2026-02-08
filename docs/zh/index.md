---
layout: home

hero:
  name: '@ocash/sdk'
  text: 隐私代币 SDK
  tagline: 基于 UTXO 模型和 zk-SNARK 证明的 TypeScript 零知识证明 SDK，支持充值、转账、提现
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: API 参考
      link: /zh/api/sdk

features:
  - title: 零知识证明
    details: 基于 zk-SNARK 电路（Go WASM）实现链上隐私。转账和提现无需暴露发送方、接收方或金额。
  - title: UTXO 模型
    details: 采用未花费交易输出模型，配合 Poseidon2 承诺、Merkle 树和 nullifier 进行状态管理。
  - title: 多环境支持
    details: 支持浏览器、Node.js 和混合容器（Electron/Tauri）。三个入口点搭配环境专属存储适配器。
  - title: 模块化架构
    details: 工厂模式配合事件驱动的模块体系 — core、wallet、sync、planner、ops 等。按需组合使用。
---
