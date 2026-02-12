import type { ChainConfigInput } from './types';

/**
 * OCash mainnet deployment — ETH (Chain ID 1)
 *
 * Pools: ETH, USDT, USDC
 */
export const ETH_MAINNET: ChainConfigInput = {
  chainId: 1,
  rpcUrl: 'https://ethereum.publicnode.com',
  entryUrl: 'https://api.o.cash',
  ocashContractAddress: '0x428c850be686E933DD641eE43574BA35f550c94c',
  relayerUrl: 'https://relayer.eth.o.cash',
  merkleProofUrl: 'https://freezer.eth.o.cash',
  tokens: [
    {
      id: '17545360559498738825600693637092498593896721537850539876701260384379485779337',
      symbol: 'ETH',
      decimals: 18,
      wrappedErc20: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      viewerPk: ['10431080094083715294994831484153042002358206676578707988845164128739412116223', '19779949618985856145522409496192533589639440661307361841631626271154462919413'],
      freezerPk: ['4669474039172149691654565526011752760208335185174811747074129322851928951709', '13559226903331282409026052744251929479054127336193904689356637527155192056962'],
      depositFeeBps: 0,
      withdrawFeeBps: 25,
      transferMaxAmount: '400000000000000000',
      withdrawMaxAmount: '400000000000000000',
    },
    {
      id: '21694853498936857802878675918794851809547521289097726489923935218185698877320',
      symbol: 'USDT',
      decimals: 6,
      wrappedErc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      viewerPk: ['16705602615272268567003522975712421097082383063417679753060534780702444376151', '14514464143093266825290311242522740387541372997639894559538766466467730361203'],
      freezerPk: ['12575519572146277363559222067073217394207912146376135522069598095499837742570', '20535825957543427476664044300935290889134231934616628729189553228696621211842'],
      depositFeeBps: 0,
      withdrawFeeBps: 25,
      transferMaxAmount: '1100000000',
      withdrawMaxAmount: '1100000000',
    },
    {
      id: '11226050049409498505939496770765866974660028682723870027960291963252866049316',
      symbol: 'USDC',
      decimals: 6,
      wrappedErc20: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      viewerPk: ['16408202230502737808122446059528930220029255337981840633285060802361479283836', '17528225055965774467947477739977284695101684174817111739322691798291270386094'],
      freezerPk: ['15980098794435051556981682500054353051595366679414420688044679627547667214405', '2904968504476045233800601625384230437775402181939804897702328669440256553067'],
      depositFeeBps: 0,
      withdrawFeeBps: 25,
      transferMaxAmount: '1100000000',
      withdrawMaxAmount: '1100000000',
    },
  ],
};

/**
 * OCash mainnet deployment — BSC (Chain ID 56)
 *
 * Pools: BNB, USDT (18 decimals), USDC (18 decimals)
 */
export const BSC_MAINNET: ChainConfigInput = {
  chainId: 56,
  rpcUrl: 'https://bsc-dataseed.binance.org',
  entryUrl: 'https://api.o.cash',
  ocashContractAddress: '0x428c850be686E933DD641eE43574BA35f550c94c',
  relayerUrl: 'https://relayer.bsc.o.cash',
  merkleProofUrl: 'https://freezer.bsc.o.cash',
  tokens: [
    {
      id: '11043839122927653445789373545236174803416089780038640455250920783766024405069',
      symbol: 'BNB',
      decimals: 18,
      wrappedErc20: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      viewerPk: ['2309793049357517448142321114460369309441946778252028524336988707673525672394', '5292166541938152970826407775516613758839325710048237682058131618937496773037'],
      freezerPk: ['15028649808275023419560920538322062726247816239833812196442442458279069670264', '7903652073623022193600601685964664648321872063306669757515720575130332270436'],
      depositFeeBps: 0,
      withdrawFeeBps: 25,
      transferMaxAmount: '1200000000000000000',
      withdrawMaxAmount: '1200000000000000000',
    },
    {
      id: '1969159127143780299399846218651451936750283610785389753103427789478696961889',
      symbol: 'USDT',
      decimals: 18,
      wrappedErc20: '0x55d398326f99059fF775485246999027B3197955',
      viewerPk: ['8400168527137830145081217535414518411779514482117693172611259130549021548989', '1261397819989223099152893934461722757575091710731435255910419325283575812925'],
      freezerPk: ['659749145987120603531117326148363604949154202537727562906479440611968845724', '17813396953204707572555397363539007301144589839857358093914040365539381830529'],
      depositFeeBps: 0,
      withdrawFeeBps: 25,
      transferMaxAmount: '1100000000000000000000',
      withdrawMaxAmount: '1100000000000000000000',
    },
    {
      id: '3177497449629755193483757929553534539571803936948283825289458505284757894932',
      symbol: 'USDC',
      decimals: 18,
      wrappedErc20: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      viewerPk: ['15426941078324356391962087739725964566987354126369627941001992221614158366184', '7926725070883903362121983237810319503556998500983795297359593812964095807270'],
      freezerPk: ['12191455112750858004776142581318299249626585524485520874715090117200793071154', '9077996288718299849424958996852385225019490548278701136796749334245970034895'],
      depositFeeBps: 0,
      withdrawFeeBps: 25,
      transferMaxAmount: '1100000000000000000000',
      withdrawMaxAmount: '1100000000000000000000',
    },
  ],
};

/**
 * OCash mainnet deployment — Base (Chain ID 8453)
 *
 * Pools: loaded dynamically from contract
 */
export const BASE_MAINNET: ChainConfigInput = {
  chainId: 8453,
  entryUrl: 'https://api.2.o.cash',
  ocashContractAddress: '0x428c850be686E933DD641eE43574BA35f550c94c',
  relayerUrl: 'https://relayer.base.2.o.cash',
  merkleProofUrl: 'https://freezer.base.2.o.cash',
  tokens: [],
};

/**
 * OCash testnet deployment — Sepolia (Chain ID 11155111)
 */
export const SEPOLIA_TESTNET: ChainConfigInput = {
  chainId: 11155111,
  rpcUrl: 'https://sepolia.drpc.org',
  entryUrl: 'https://testnet-api.o.cash',
  ocashContractAddress: '0xAeec58628cC3DC9E9C491e829051D5772679fb7f',
  relayerUrl: 'https://testnet-relayer-sepolia.o.cash',
  merkleProofUrl: 'https://testnet-freezer-sepolia.o.cash',
  tokens: [],
};

/**
 * OCash testnet deployment — BSC Testnet (Chain ID 97)
 */
export const BSC_TESTNET: ChainConfigInput = {
  chainId: 97,
  rpcUrl: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  entryUrl: 'https://testnet-api.o.cash',
  ocashContractAddress: '0xAeec58628cC3DC9E9C491e829051D5772679fb7f',
  relayerUrl: 'https://testnet-relayer-bsctestnet.o.cash',
  merkleProofUrl: 'https://testnet-freezer-bsctestnet.o.cash',
  tokens: [],
};

/** All mainnet chain configs. */
export const MAINNET_CHAINS: ChainConfigInput[] = [ETH_MAINNET, BSC_MAINNET, BASE_MAINNET];

/** All testnet chain configs. */
export const TESTNET_CHAINS: ChainConfigInput[] = [SEPOLIA_TESTNET, BSC_TESTNET];
