/* tslint:disable */
/* eslint-disable */
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';

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
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const require = createRequire(import.meta.url);
  // Try to load the native module from the root directory
  const modulePath = resolve(__dirname, '..', 'index.node');
  nativeBinding = require(modulePath);
} catch (e) {
  throw new Error(`Failed to load native binding: ${e}`);
}

if (!nativeBinding) {
  throw new Error('Native binding is undefined after loading');
}

export const { SimulationClient: NativeSimulationClient } = nativeBinding;
export default nativeBinding; 