/* tslint:disable */
/* eslint-disable */

export interface AmountOutResult {
  pool: string;
  amountsOut: bigint[];
  gasUsed: bigint[];
}

export declare class SimulationClient {
  constructor(tychoUrl: string, apiKey?: string, tvlThreshold?: number);
  getSpotPrice(token0Address: string, token1Address: string): Promise<number>;
  getAmountOut(tokenInAddress: string, tokenOutAddress: string, amountsIn: bigint[]): Promise<AmountOutResult[]>;
}

let nativeBinding: { SimulationClient: typeof SimulationClient } | undefined;

try {
  const path = require('path');
  // Try to load the native module from the root directory
  const modulePath = path.resolve(__dirname, '..', 'index.node');
  nativeBinding = require(modulePath);
} catch (e) {
  throw new Error(`Failed to load native binding: ${e}`);
}

if (!nativeBinding) {
  throw new Error('Native binding is undefined after loading');
}

export const { SimulationClient: NativeSimulationClient } = nativeBinding;
export default nativeBinding; 