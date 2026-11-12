import type { JobId } from '@dragon-rush/engine';

/** Canvas copies of the art-direction §2 tokens (the canvas cannot read CSS variables cheaply). */
export const PAL = {
  table0: '#0F0B0A',
  table1: '#1A1210',
  woodDark: '#3B2618',
  wood: '#5A3A22',
  parchment: '#EAD9B5',
  ink: '#2B1D14',
  gold: '#D9A441',
  goldHi: '#F6D47A',
  goldDeep: '#8A6424',
  ember: '#C8402A',
  emberHot: '#FF7A3D',
  emberGlow: '#FFB25B',
  panel: '#1E1512',
  panel2: '#2A1D18',
  panelLine: '#4A3524',
  bone: '#F1E6D2',
  boneDim: '#B8A68C',
  good: '#3E7D4A',
  bad: '#A3322B',
  moon: '#8FB3D9',
  hazardFill: '#FF7A3D',
  hazardEdge: '#FFB25B',
  outline: '#1A1210',
  hp: '#C8402A',
  hpHi: '#E8665B',
  hpLow: '#FF7A3D',
  boss: '#7A1F1A',
  bossHi: '#A3322B',
} as const;

/** Job tint for clothing (muted) and the slash trail signature (art-direction §11.2 P1). */
export const JOB_LOOK: Readonly<
  Record<JobId, { readonly body: string; readonly trim: string; readonly trail: string }>
> = {
  swordsman: { body: '#5B6C82', trim: '#C9D3DF', trail: '#DDEBFF' },
  archer: { body: '#4F6B3E', trim: '#D9B26A', trail: '#F6D47A' },
  mage: { body: '#4E3F7A', trim: '#B38CFF', trail: '#9FD8FF' },
  ninja: { body: '#2E2A38', trim: '#A77BFF', trail: '#B48CFF' },
  berserker: { body: '#7A3B26', trim: '#E0A15A', trail: '#FF8A3D' },
};

export const DRAGON_LOOK = {
  body: '#5A1E1A',
  belly: '#8A3A24',
  wing: '#3E1412',
  scale: '#7A2A22',
  eye: '#FFB25B',
} as const;

/** Seat crest shapes so colour is never the only cue (art-direction §2, WCAG 1.4.1). */
export type { Crest as CrestShape } from '../../types/fightView';

/** Canvas font stacks (Korean-capable display/impact faces with system fallbacks). */
export const FONT_IMPACT =
  "'Black Han Sans', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif";
export const FONT_UI =
  "'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif";
