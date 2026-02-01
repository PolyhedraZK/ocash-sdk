import type { DemoContext } from './_types.js';

export async function demoInit(ctx: DemoContext) {
  const seed = ctx.config.seed;
  console.log('accountNonce:', ctx.config.accountNonce);
  const pub = ctx.sdk.keys.getPublicKeyBySeed(seed, ctx.config.accountNonce != null ? String(ctx.config.accountNonce) : undefined);
  const viewingAddress = ctx.sdk.keys.userPkToAddress(pub.user_pk);
  console.log('user_pk:', pub.user_pk);
  console.log('viewingAddress:', viewingAddress);

  await ctx.sdk.core.ready((v) => {
    console.log('[core:ready:progress]', Math.floor(v * 100));
  });
  console.log('core ready');
}
