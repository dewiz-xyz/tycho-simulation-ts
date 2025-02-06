import * as dotenv from 'dotenv';
import { SimulationClient } from '../src';
import { AmountOutResult } from '../src/binding';

// Load environment variables first
dotenv.config();

const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is not set");
}

process.env.RPC_URL = rpcUrl;  // Make sure it's set in the environment

async function runTest(): Promise<void> {
    try {
        console.log("Creating simulation client...");
        const tvlThreshold = 1000;
        
        const apiKey = process.env.TYCHO_API_KEY;
        if (!apiKey) {
            throw new Error("TYCHO_API_KEY environment variable is not set");
        }

        const client = new SimulationClient(
            "tycho-beta.propellerheads.xyz",
            apiKey,
            tvlThreshold
        );
        console.log("Client created successfully");

        const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";  // Ethereum Mainnet WETH
        const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";  // Ethereum Mainnet USDC

        // Generate 10000 amounts between 0.1 and 10 ETH (in wei)
        const amountsInWei = Array.from({ length: 10000 }, () => {
            const ethAmount = 0.1 + Math.random() * 9.9; // Random ETH amount between 0.1 and 10
            return BigInt(Math.floor(ethAmount * 1e18)); // Convert to wei and ensure it's an integer
        });
        
        console.log(`Generated ${amountsInWei.length} test amounts`);
        console.log("Sample amounts (first 5):");
        amountsInWei.slice(0, 5).forEach(amount => {
            console.log(`${amount} wei (${Number(amount) / 1e18} ETH)`);
        });

        console.log("\nQuerying amounts out...");
        const startTime = process.hrtime.bigint();

        const results: AmountOutResult[] = await client.getAmountOut(WETH, USDC, amountsInWei);
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1e6; // Convert to milliseconds

        console.log("\nResults:");
        console.log(`Query time: ${duration.toFixed(2)}ms`);
        console.log(`Average time per swap: ${(duration / amountsInWei.length).toFixed(3)}ms`);
        console.log("\nFound pools:", results.length);
        
        // Display detailed results for each pool (but only show first 5 amounts)
        results.forEach((result: AmountOutResult, index: number) => {
            console.log(`\nPool ${index + 1} (${result.pool}):`);
            console.log("Sample amounts out (first 5):");
            for (let i = 0; i < 5; i++) {
                const ethAmount = Number(amountsInWei[i]) / 1e18; // Convert wei to ETH for display
                const usdcAmount = Number(result.amountsOut[i]) / 1e6; // Convert USDC smallest unit to USDC for display
                console.log(`${ethAmount} ETH (${amountsInWei[i]} wei) -> ${usdcAmount} USDC (${result.amountsOut[i]} units) (Gas: ${result.gasUsed[i]})`);
            }
            // Add summary statistics
            const avgGas = Number(result.gasUsed.reduce((a, b) => a + b, BigInt(0))) / result.gasUsed.length;
            console.log(`Average gas used: ${avgGas.toFixed(2)}`);
        });

    } catch (error) {
        console.error("Test error:", error);
    }
}

// Run the test
async function main(): Promise<void> {
    console.log("Starting amount out test...");
    const startTime = process.hrtime.bigint();
    
    await runTest();
    
    const endTime = process.hrtime.bigint();
    const totalDuration = Number(endTime - startTime) / 1e9; // Convert to seconds
    console.log(`\nTotal execution time: ${totalDuration.toFixed(2)} seconds`);
    
    process.exit(0);
}

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
}); 

