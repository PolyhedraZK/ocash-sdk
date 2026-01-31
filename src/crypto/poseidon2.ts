/**
 * Poseidon2 hash implementation (t = 3, rate = 2, capacity = 1) for the BN254 scalar field.
 * Mirrors the on-chain Solidity implementation that powers the upgraded circuits with
 * domain-separated hashing.
 */

import { BN254_FIELD_MODULUS } from './field';

export const Poseidon2Domain = {
  None: 0x0000000000000000n,
  Record: 0x5245434f52440000n, // "RECORD"
  Nullifier: 0x4e554c4c49464945n, // "NULLIFIE"
  Merkle: 0x4d45524b4c450000n, // "MERKLE"
  Policy: 0x504f4c4943590000n, // "POLICY"
  Array: 0x4152524159000000n, // "ARRAY"
  Memo: 0x4d454d4f00000000n, // "MEMO"
  Asset: 0x4153534554000000n, // "ASSET"
  KeyDerivation: 0x4b45594445520000n, // "KEYDER"
} as const;

type DomainValue = (typeof Poseidon2Domain)[keyof typeof Poseidon2Domain];
type HashInput = bigint | number | string;

export class Poseidon2 {
  // BN254 scalar field prime
  private static readonly P = BN254_FIELD_MODULUS;

  // Round keys generated from gnark-crypto (identical to the Solidity contract)
  private static readonly FULL_ROUND_KEYS_START: readonly [bigint, bigint, bigint][] = [
    [
      0x2ba117aea05b03e08d3e8cdc3441e489710b7eae2127240261f1161a4c375ec3n,
      0x13d62b66e9d5236b1c4349076bc462097eca577bcd980e3e5262986898001a95n,
      0x2ceb56ddb7d8c8886771c2f12a458edd58886a852e29ea9a157cb6c3ba8201a2n,
    ],
    [
      0xba9383b6a5ba188031f7377b152f8df895115269e8437f9eccdc767ecaf458fn,
      0x188b8a2dd4baa4aeda8cf74c2cb3f5dfa482de9987f03fdeafd832f6c3be19c6n,
      0x2672744cbbe045c930be1dcaae5b38cf4f0b9673514cbe5129908164ef7d7b58n,
    ],
    [
      0x1e0365a9b92d37b502579f6a3c3236df558f8417be56e58908897fa5cfbf15bbn,
      0x2060426d53c6386a3f2f4e29d886bfc8e1be0ddafbdb50a9fd0be33143d1004an,
      0x1b917ac39485d49545e20d21e06735af839b1360e077daa4dfc2938ff91ce4d0n,
    ],
    [
      0x2065aa0d75c8773cd397593ca429c21ad2d10c066a09dea04378fed619021786n,
      0x4767c771c63b9efcaee16d3463c0457ba7f029dd533e5c7f4b3ccef3677db6bn,
      0x2b632ce28c5d4908c11b68f4ed9e3da0dd104c018d2376eaa0abd28f9cf8bd76n,
    ],
  ];

  private static readonly PARTIAL_ROUND_KEYS: readonly bigint[] = [
    0x122bd8150e3bf5129ed1f41b201d3881fe41c68ed194ffe6b414de857f03765dn,
    0x23d4440906f4412f8994c3fa4cc08e849c0fbd10dc12518a07c0e8d77562c13fn,
    0x2c5e99b87c743de13935855afed6cf836d6dd62ce31dfdca21efcfe197c9e321n,
    0x6fba87a3924cbbb4117b782aa697bbc23900de6bf31a28ecc2f6a9225aebfe4n,
    0xc954d8f108f43ece97439775cfa22e1343a6cacae91604c76601eb6c7e90e1bn,
    0x20980b82aa1ac356a0a48bc8101468c74f1efd47cd29ea01a852d6af93836a44n,
    0x7e9df3ac21d190f9281b2ac56bf9dcce410bf95bd7fc196f4cfbb86acb60ec6n,
    0x1e7459f591496f37d759e6eb427fa073eb923d9a67b066271dabe8e793ad796n,
    0xc1b5194e4c1af42dc01dadde54c73624ce1b8a0302d25ad499b2036f768e6e8n,
    0xcfd0f94030d285ffb85c8aa9f0675ac7077133b5a329c78b74656932fac8a27n,
    0x212ea73cc21625d7f1e361ad3df28c9f9cfd57fec66fb1bf69f1ab7cd11c55cn,
    0x25fbc0b1fa13ea08b022f853e9b07a5c0fe9d5fb23c26eec54599100e60d57f6n,
    0x74521adcc4a9387f4d6feeac681b1115b92f5e98e35d6d591d79b75d61d204cn,
    0x267f9f5e6eea2a9d8816d7b683ab95d8121adeeaae66990bd24be95b6f0a0cd9n,
    0x2fdf445c73cde6a7f4f23bef9bf520ceb72f08dabd391b118a253630f2878aden,
    0x2645e68b2890d258fa7eaffbc587c5ca8f7099cc4ddf923e23672c6153a8ae7n,
    0xc9e3d4841852fcf02818cdd86c3d86dcae4c1f7c140c3b17edc1f17b2652079n,
    0xa42e90f71ff44221ec000e0ff81b6f229292b0cb4470ff7c66c1fe06d9e69aan,
    0x1fb9a7d91fcf3173a1d80d3749192ed7d8a5b50cfd631571dc15154d0e71d7a2n,
    0x10bff373cf04aca27c90792eaa545000503d6f118f4d9c5a906203aefe316d42n,
    0x956799581ce2c42ed5b55a130fb853683014e7cb9c3f32b9dfa4cf5c53127an,
    0x2b0bd2da61cae5f4f442b449cb1e9cc6af7a6d126b02ffd65aa887278741ab07n,
    0x1c76af7e47ec30b4139081219fd7d173d498ba2e2ca928fb2b26019b16e5c64n,
    0x2d9e586bd3c8cde82932cd1397db8564cbdebfc4f5c970e28a2d9f559db9d696n,
    0x2c4b2a625ac29f468cc94f6a3ebdb7bb962f245568676073b829b95ace6d1cccn,
    0x27299c22883e4d52b8251a0724083c063e7be0a7f0070fba1c8d4d206841e6an,
    0x2af17121feea81979d98fa13cfdb5cf7f1f1717168ee7bf2da3709e589c381e7n,
    0x9ad5501e4c9db7fee67f2fda8ce71162e6b2e0fc252f03c3d40470168ed4ea7n,
    0x276bf230a40c51dac71697a84d603ac0423e3d8f23cc9330a23306976f7f902dn,
    0xb40af0d626b972c04b83a3897031c9bd0b4acc3b138fc505e15fdb6b60ba5f8n,
    0x15c6033f97a1337ce18e37d0d22cf07f6c80f96af620c4d67c351e7210d688cfn,
    0x27a5134eeea854449d10ae3dd3e17cbfc0f24c21a4265bb1e99982af48eb3966n,
    0xa3f27bafac251bbc63797868e84434a412400913e2e11616cb18f3bd01eb0d7n,
    0x9409ff82de14430d5f1f16dd157c8175372a4f922b3563550230390c4476c59n,
    0x1b6b39381a0b663344ee9a8cff259b84c593b709cf543014996ec33c7a00008bn,
    0x16ac5b58d45468a298e60cbb92055daa665f29dd7194c77cac679c35f6f64552n,
    0x121fb0f41bab603e46a4f4cb110d0a56bceff1f3af5577e7715e3777a5cfe7d8n,
    0x56f262099a9d3e1d0060799732486358ad8b7bd2f515dd8767c2d19917d282dn,
    0x626740e4ff0fe7b8df127d56310c0c1fc47a07f630983bd55800ee8e24911d8n,
    0xb2b0b1213bed0c4b40fe2c938d076c65f22fe21eef4767b507561a63eea2874n,
    0x1674784dcc6d6b3ef6467ee673c85311d1375aa39122ecf4b942caba565a6982n,
    0x690678b4bc42090fdbed7a334b323db5441a24c92b5b234f54ec16cff367db3n,
    0x186719b1d7d0fb0087396c72ba57f53a5b67dc1077b82caadc62d5cdf7cd8db4n,
    0x178ed1e5ce3430020a30f0684fb01c60136e731a9a8c6afcbad139af2e8fcf7n,
    0x1f31dc123a2384c71b57678dcf5a2fa6294f88a21a333cbec5facbc69424306cn,
    0x17d928d2e3dbbe3a273f0bec79f881f8b75f4d333002b528fb1ae737cbf13ebn,
    0x2f4fb0605668c045469510611c0137828be267709c0fa9392c28c2d95f9504bbn,
    0x2ee2627a181d62b24501da3efccba9b4a9b61e6d9a7cdaa152c39347bdebe481n,
    0x254cd2d79997885ca82e0ec5998aab8de0b09a02d04f54dcbd1a6f8776fd537bn,
    0x2aa675a61643b83ad60d88b16c574a4695fc1b463dd44f8bbd674d1a1294dbfen,
    0x2dbc70b7e86794439ebd7d10cee37147e51769ed7a441187f6e22e644a003a51n,
    0x19fc425ab24feca173ddab7070ebb4a2eeb9b82bee3a399ebedef2affe3ecd96n,
    0x1b7a37f7ef7ce586df66295e955aba1b9b15052673534d4c13e02c19f02959e2n,
    0x772f989bc7bc4361340c9887a0225b92a192c14a85dc3ade21f6135b9239341n,
    0x13f24e0e97fad4c45866626b9a1b9f3cc46f4ab2a018f0bda5bdade2087a07cfn,
    0x1976c62d2c2c4ba095ff81bef054fe0757d7301950ede83426a34dd6cc12a4a5n,
  ];

  private static readonly FULL_ROUND_KEYS_END: readonly [bigint, bigint, bigint][] = [
    [
      0x1ea7aeca90530805e5fa1b676a6f12ace24c1c0f5b6cd68bf01558be11bb864an,
      0x70249ba94928b35fe02f56b12590e86f21a8a19e949ec10b62a5fcefea5c2b3n,
      0x2cd4b5f5d87caaac64f78c44a62c408211c2e1d70a69549f9f1d36bd8a46073n,
    ],
    [
      0x7f4c9774540f9f81fa29a73910899ad91d950e8f83a4f52d37ccc35a982f152n,
      0x2d8b931d897f634fd9cdae140a7b3f4d4bab1814e009fe84e754c4a23ae23ccn,
      0x2b9e86726e0cfec43981d9898da6ddb631ae469a473aa73e570274ecd2376899n,
    ],
    [
      0xc96c00773943b1de5a3dfb5959f30975f85adc57cc641bc2cea037837447191n,
      0x258a43226d21462808593a8701f2dce2aaa28668f8fe35647a706fa4a81d5d47n,
      0x26688ac841f42286102d1494db773e91760d8cad9cfb1a654284ed630a9bee42n,
    ],
    [
      0xb39f30858ad21e1805c8ced014837777cfdd776fc2d4c07a97b2351f21764b1n,
      0xb114bc66867e038d6648a6ab3556243a5f78ea3db7aa997ba13961735792377n,
      0xc08b1719426f8ff2dee487f9f41ac785ffdb8a7be5fc869754689cb02999e51n,
    ],
  ];

  /**
   * Hash two field elements with the default (zero) domain.
   */
  public static hash(a: bigint, b: bigint): bigint {
    return this.hashDomain(a, b, Poseidon2Domain.None);
  }

  /**
   * Hash two inputs with an explicit domain (matches Solidity's hashDomain).
   */
  public static hashDomain(a: HashInput, b: HashInput, domain: HashInput | DomainValue): bigint {
    let state0 = this.normalize(a);
    let state1 = this.normalize(b);
    let state2 = this.normalize(domain);

    [state0, state1, state2] = this.permutation(state0, state1, state2);
    return state0;
  }

  /**
   * Convenience helper that accepts generic inputs (numbers / strings / bigint)
   * and allows passing an optional domain (defaults to Poseidon2Domain.None).
   */
  public static hashInputs(a: HashInput, b: HashInput, domain: HashInput | DomainValue = Poseidon2Domain.None): bigint {
    return this.hashDomain(a, b, domain);
  }

  /**
   * Hash helper that mirrors Solidity's folding pattern:
   *   h = hashDomain(inputs[0], inputs[1]); h = hashDomain(h, inputs[2]); ...
   * If a seed is provided it is used as the left input for the first element, allowing
   * constructions such as array hashes that start from zero.
   */
  public static hashSequenceWithDomain(
    inputs: HashInput[],
    domain: HashInput | DomainValue,
    seed?: HashInput,
  ): bigint {
    if (inputs.length === 0) {
      if (seed === undefined) {
        throw new Error('Poseidon2.hashSequenceWithDomain requires at least one input or a seed.');
      }
      return this.normalize(seed);
    }

    if (inputs.length === 1 && seed === undefined) {
      return this.hashDomain(0n, inputs[0], domain);
    }

    let acc: bigint;
    let startIndex: number;
    if (seed !== undefined) {
      acc = this.hashDomain(seed, inputs[0], domain);
      startIndex = 1;
    } else {
      acc = this.hashDomain(inputs[0], inputs[1], domain);
      startIndex = 2;
    }

    for (let i = startIndex; i < inputs.length; i++) {
      acc = this.hashDomain(acc, inputs[i], domain);
    }

    return acc;
  }

  /**
   * Hash two inputs and return a 0x-prefixed hex string.
   */
  public static hashToHex(a: HashInput, b: HashInput, domain: HashInput | DomainValue = Poseidon2Domain.None): string {
    const result = this.hashInputs(a, b, domain);
    return `0x${result.toString(16).padStart(64, '0')}`;
  }

  /**
   * Apply one Poseidon2 permutation (64 rounds) to the current state.
   */
  private static permutation(state0: bigint, state1: bigint, state2: bigint): [bigint, bigint, bigint] {
    [state0, state1, state2] = this.externalMatrix(state0, state1, state2);

    for (const [c0, c1, c2] of this.FULL_ROUND_KEYS_START) {
      state0 = this.sbox(this.addMod(state0, c0));
      state1 = this.sbox(this.addMod(state1, c1));
      state2 = this.sbox(this.addMod(state2, c2));
      [state0, state1, state2] = this.externalMatrix(state0, state1, state2);
    }

    for (const constant of this.PARTIAL_ROUND_KEYS) {
      state0 = this.sbox(this.addMod(state0, constant));
      [state0, state1, state2] = this.partialMatrix(state0, state1, state2);
    }

    for (const [c0, c1, c2] of this.FULL_ROUND_KEYS_END) {
      state0 = this.sbox(this.addMod(state0, c0));
      state1 = this.sbox(this.addMod(state1, c1));
      state2 = this.sbox(this.addMod(state2, c2));
      [state0, state1, state2] = this.externalMatrix(state0, state1, state2);
    }

    return [state0, state1, state2];
  }

  private static normalize(value: HashInput): bigint {
    const normalized = typeof value === 'bigint' ? value : BigInt(value);
    const mod = normalized % this.P;
    return mod >= 0n ? mod : mod + this.P;
  }

  private static addMod(a: bigint, b: bigint): bigint {
    const sum = a + b;
    const mod = sum % this.P;
    return mod >= 0n ? mod : mod + this.P;
  }

  private static mulMod(a: bigint, b: bigint): bigint {
    return (a * b) % this.P;
  }

  private static sbox(x: bigint): bigint {
    const x2 = this.mulMod(x, x);
    const x4 = this.mulMod(x2, x2);
    return this.mulMod(x4, x);
  }

  private static externalMatrix(state0: bigint, state1: bigint, state2: bigint): [bigint, bigint, bigint] {
    const sum = this.addMod(this.addMod(state0, state1), state2);
    return [this.addMod(state0, sum), this.addMod(state1, sum), this.addMod(state2, sum)];
  }

  private static partialMatrix(state0: bigint, state1: bigint, state2: bigint): [bigint, bigint, bigint] {
    const sum = this.addMod(this.addMod(state0, state1), state2);
    const newState0 = this.addMod(state0, sum);
    const newState1 = this.addMod(state1, sum);
    const doubledState2 = this.addMod(state2, state2);
    const newState2 = this.addMod(doubledState2, sum);
    return [newState0, newState1, newState2];
  }
}
