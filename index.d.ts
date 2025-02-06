/* tslint:disable */
/* eslint-disable */

/* auto-generated by NAPI-RS */

export interface AmountOutResult {
  pool: string
  amountsOut: Array<bigint>
  gasUsed: Array<bigint>
}
export declare class SimulationClient {
  constructor(tychoUrl: string, apiKey: string, tvlThreshold: number)
  getSpotPrice(token0Address: string, token1Address: string): number
  getAmountOut(tokenInAddress: string, tokenOutAddress: string, amountsIn: Array<bigint>): Array<AmountOutResult>
}
