/** Describes the HP actually lost after an unpaid event coin penalty. */
export const coinShortfallMessage = (hpLost: number): string =>
  `코인이 부족해 HP ${hpLost}를 대신 잃었습니다`;
