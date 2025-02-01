/* tslint:disable */
/* eslint-disable */

export interface AmountOutResult {
  pool: string;
  amountsOut: number[];
  gasUsed: number[];
}

export declare class SimulationClient {
  constructor(tychoUrl: string, apiKey?: string | null, tvlThreshold?: number | null);
  getSpotPrice(token0Address: string, token1Address: string): Promise<number>;
  getAmountOut(tokenInAddress: string, tokenOutAddress: string, amountsIn: number[]): Promise<AmountOutResult[]>;
}

let nativeBinding: { SimulationClient: typeof SimulationClient } | undefined;

try {
  // Try to load the native module from various possible locations
  const possiblePaths = [
    // When imported from dist/
    '../../index.node',
    // When imported from examples/
    '../index.node',
    // When imported from root
    './index.node'
  ];

  for (const path of possiblePaths) {
    try {
      nativeBinding = require(path);
      break;
    } catch (e) {
      // Continue trying other paths
    }
  }

  if (!nativeBinding) {
    throw new Error('Could not find native module in any expected location');
  }
} catch (e) {
  throw new Error(`Failed to load native binding: ${e}`);
}

export const { SimulationClient: NativeSimulationClient } = nativeBinding;
export default nativeBinding; 