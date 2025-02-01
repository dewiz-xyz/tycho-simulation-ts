import { NativeSimulationClient as SimulationClient } from './binding';
import { AmountOutResult } from './types';

export { SimulationClient, AmountOutResult };

export async function createClient(
  tychoUrl: string,
  apiKey?: string,
  tvlThreshold?: number
): Promise<InstanceType<typeof SimulationClient>> {
  return new SimulationClient(tychoUrl, apiKey, tvlThreshold);
}

export default {
  SimulationClient,
  createClient,
};