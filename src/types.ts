export interface SimulationClient {
    getSpotPrice(token0: string, token1: string): Promise<number>;
    getAmountOut(tokenIn: string, tokenOut: string, amountsIn: number[]): Promise<AmountOutResult[]>;
}

export interface AmountOutResult {
    pool: string;
    amounts_out: number[];
    gas_used: number[];
}

export interface SwapResult {
    poolAddress: string;
    amountsOut: bigint[];
    gasEstimates: bigint[];
    protocol: string;
}

export interface TychoSimulation {
    createClient: (
        url: string,
        apiKey: string,
        tvlThreshold: number
    ) => Promise<SimulationClient>;
    
    getAmountOut: (
        client: SimulationClient,
        tokenIn: string,
        tokenOut: string,
        amountsIn: bigint[]
    ) => Promise<SwapResult[]>;

    getSpotPrice(client: SimulationClient, token0: string, token1: string): Promise<bigint>;
}