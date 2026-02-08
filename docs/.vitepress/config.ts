import { defineConfig } from 'vitepress';

export default defineConfig({
  title: '@ocash/sdk',
  description: 'TypeScript ZKP SDK for privacy-preserving token operations',

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'API Reference', link: '/api/sdk' },
          { text: 'GitHub', link: 'https://github.com/PolyhedraZK/ocash-sdk' },
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Introduction',
              items: [
                { text: 'Getting Started', link: '/guide/getting-started' },
                { text: 'Configuration', link: '/guide/configuration' },
              ],
            },
            {
              text: 'Core Concepts',
              items: [
                { text: 'Architecture', link: '/guide/architecture' },
                { text: 'UTXO Model', link: '/guide/utxo-model' },
                { text: 'Storage Adapters', link: '/guide/storage' },
                { text: 'Events & Errors', link: '/guide/events' },
              ],
            },
            {
              text: 'Operations',
              items: [
                { text: 'Deposit', link: '/guide/deposit' },
                { text: 'Transfer', link: '/guide/transfer' },
                { text: 'Withdraw', link: '/guide/withdraw' },
              ],
            },
          ],
          '/api/': [
            {
              text: 'API Reference',
              items: [
                { text: 'createSdk', link: '/api/sdk' },
                { text: 'Core', link: '/api/core' },
                { text: 'Wallet', link: '/api/wallet' },
                { text: 'Keys & Crypto', link: '/api/crypto' },
                { text: 'Sync', link: '/api/sync' },
                { text: 'Planner', link: '/api/planner' },
                { text: 'Ops', link: '/api/ops' },
                { text: 'Storage', link: '/api/storage' },
                { text: 'Types', link: '/api/types' },
              ],
            },
          ],
        },
      },
    },
    zh: {
      label: '中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/getting-started' },
          { text: 'API 参考', link: '/zh/api/sdk' },
          { text: 'GitHub', link: 'https://github.com/PolyhedraZK/ocash-sdk' },
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '介绍',
              items: [
                { text: '快速开始', link: '/zh/guide/getting-started' },
                { text: '配置', link: '/zh/guide/configuration' },
              ],
            },
            {
              text: '核心概念',
              items: [
                { text: '架构', link: '/zh/guide/architecture' },
                { text: 'UTXO 模型', link: '/zh/guide/utxo-model' },
                { text: '存储适配器', link: '/zh/guide/storage' },
                { text: '事件与错误', link: '/zh/guide/events' },
              ],
            },
            {
              text: '操作',
              items: [
                { text: '充值', link: '/zh/guide/deposit' },
                { text: '转账', link: '/zh/guide/transfer' },
                { text: '提现', link: '/zh/guide/withdraw' },
              ],
            },
          ],
          '/zh/api/': [
            {
              text: 'API 参考',
              items: [
                { text: 'createSdk', link: '/zh/api/sdk' },
                { text: 'Core', link: '/zh/api/core' },
                { text: 'Wallet', link: '/zh/api/wallet' },
                { text: 'Keys & Crypto', link: '/zh/api/crypto' },
                { text: 'Sync', link: '/zh/api/sync' },
                { text: 'Planner', link: '/zh/api/planner' },
                { text: 'Ops', link: '/zh/api/ops' },
                { text: 'Storage', link: '/zh/api/storage' },
                { text: 'Types', link: '/zh/api/types' },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/PolyhedraZK/ocash-sdk' },
    ],
  },
});
