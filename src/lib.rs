#![deny(clippy::all)]

use futures::{Stream, StreamExt};
use napi_derive::napi;
use napi::{bindgen_prelude::*, Result};
use num_bigint::{BigUint, Sign};
use num_traits::cast::ToPrimitive;
use std::collections::HashMap;
use std::sync::Arc;
use std::str::FromStr;
use tycho_simulation::{
    evm::{
        protocol::{
            filters::{curve_pool_filter, balancer_pool_filter},
            uniswap_v2::state::UniswapV2State,
            uniswap_v3::state::UniswapV3State,
            vm::state::EVMPoolState,
        },
        stream::ProtocolStreamBuilder,
        engine_db::tycho_db::PreCachedDB,
    },
    models::Token,
    protocol::{
        models::{BlockUpdate, ProtocolComponent},
        state::ProtocolSim,
    },
    tycho_client::feed::component_tracker::ComponentFilter,
    tycho_core::{dto::Chain, Bytes},
    utils::load_all_tokens,
};
use std::io::Write;
use tokio::sync::{Mutex as TokioMutex};

// First, let's add a type alias at the top of the file to make things cleaner
type StreamType = Box<dyn Stream<Item = BlockUpdate> + Send + Unpin>;

#[napi(object)]
pub struct AmountOutResult {
    pub pool: String,
    pub amountsOut: Vec<BigInt>,
    pub gasUsed: Vec<BigInt>,
}

#[napi(js_name = "SimulationClient")]
pub struct SimulationClient {
    tokens: HashMap<Bytes, Token>,
    states: Arc<TokioMutex<HashMap<String, (Box<dyn ProtocolSim>, ProtocolComponent)>>>,
    protocol_stream: Arc<TokioMutex<StreamType>>,
}

#[napi]
impl SimulationClient {
    #[napi(constructor)]
    pub fn new(tycho_url: String, api_key: String, tvl_threshold: f64) -> Result<Self> {
        let runtime = tokio::runtime::Runtime::new()
            .map_err(|e| Error::from_reason(format!("Failed to create runtime: {}", e)))?;
        runtime.block_on(async {
            log("Initializing SimulationClient...");
            
            let tvl_filter = ComponentFilter::with_tvl_range(tvl_threshold, tvl_threshold);
            log(&format!("Using TVL threshold: {}", tvl_threshold));
            
            let all_tokens = load_all_tokens(&tycho_url, false, Some(&api_key)).await;
            log(&format!("Loaded {} tokens", all_tokens.len()));

            let protocol_stream = ProtocolStreamBuilder::new(&tycho_url, Chain::Ethereum)
                .exchange::<UniswapV2State>("uniswap_v2", tvl_filter.clone(), None)
                .exchange::<UniswapV3State>("uniswap_v3", tvl_filter.clone(), None)
                .exchange::<EVMPoolState<PreCachedDB>>("vm:curve", tvl_filter.clone(), Some(curve_pool_filter))
                .exchange::<EVMPoolState<PreCachedDB>>(
                    "vm:balancer_v2",
                    tvl_filter.clone(),
                    Some(balancer_pool_filter),
                )
                .auth_key(Some(api_key))
                .set_tokens(all_tokens.clone())
                .await
                .build()
                .await
                .map_err(|e| Error::from_reason(format!("Failed to build protocol stream: {}", e)))?;

            log("Protocol stream built successfully");

            let protocol_stream = Arc::new(TokioMutex::new(
                Box::new(protocol_stream.map(|r| match r {
                    Ok(update) => update,
                    Err(e) => {
                        log(&format!("Error in stream: {:?}", e));
                        BlockUpdate {
                            block_number: 0,
                            new_pairs: HashMap::new(),
                            states: HashMap::new(),
                            removed_pairs: HashMap::new(),
                        }
                    }
                })) as StreamType
            ));
            
            let states = Arc::new(TokioMutex::new(HashMap::new()));
            
            {
                let mut stream = protocol_stream.lock().await;
                if let Some(update) = stream.next().await {
                    let mut states_map = states.lock().await;
                    log(&format!("Received block {}", update.block_number));
                    log(&format!("Received update with {} new pairs", update.new_pairs.len()));
                    
                    for (id, comp) in update.new_pairs {
                        if let Some(state) = update.states.get(&id) {
                            states_map.insert(id.clone(), (state.clone(), comp.clone()));
                        }
                    }
                    
                    log(&format!("Total pools now: {}", states_map.len()));
                } else {
                    return Err(Error::from_reason("Failed to get initial state from stream"));
                }
            }

            let (tx, mut rx) = tokio::sync::mpsc::channel(100);
            
            let stream_ref = Arc::clone(&protocol_stream);
            let states_ref = Arc::clone(&states);
            
            runtime.spawn(async move {
                loop {
                    let mut stream = stream_ref.lock().await;
                    let next = stream.next().await;
                    drop(stream);

                    match next {
                        Some(update) => {
                            if tx.send(update).await.is_err() {
                                log("Channel closed, stopping stream task");
                                break;
                            }
                        }
                        None => {
                            log("Stream ended");
                            break;
                        }
                    }
                }
            });

            runtime.spawn(async move {
                while let Some(update) = rx.recv().await {
                    let mut states_map = states_ref.lock().await;
                    log(&format!("Received block {}", update.block_number));
                    
                    for (id, state) in &update.states {
                        if let Some((existing_state, _)) = states_map.get_mut(id) {
                            *existing_state = state.clone();
                        }
                    }

                    let new_pairs_count = update.new_pairs.len();
                    for (id, comp) in update.new_pairs {
                        if let Some(state) = update.states.get(&id) {
                            states_map.insert(id.clone(), (state.clone(), comp.clone()));
                        }
                    }
                    if new_pairs_count > 0 {
                        log(&format!("Added {} new pools", new_pairs_count));
                    }
                }
                log("Update processor stopped");
            });

            Ok(Self {
                tokens: all_tokens,
                states,
                protocol_stream,
            })
        })
    }

    #[napi(js_name = "getSpotPrice")]
    pub fn get_spot_price(&self, token0_address: String, token1_address: String) -> Result<f64> {
        let runtime = tokio::runtime::Runtime::new()
            .map_err(|e| Error::from_reason(format!("Failed to create runtime: {}", e)))?;
        runtime.block_on(async {
            let token0_address = normalize_address(&token0_address);
            let token1_address = normalize_address(&token1_address);

            let token0_bytes = Bytes::from_str(&token0_address)
                .map_err(|e| Error::from_reason(format!("Invalid token0 address: {}", e)))?;
            let token1_bytes = Bytes::from_str(&token1_address)
                .map_err(|e| Error::from_reason(format!("Invalid token1 address: {}", e)))?;

            let token0 = self.tokens
                .get(&token0_bytes)
                .ok_or_else(|| Error::from_reason(format!("Token not found: {}", token0_address)))?;

            let token1 = self.tokens
                .get(&token1_bytes)
                .ok_or_else(|| Error::from_reason(format!("Token not found: {}", token1_address)))?;

            let states = self.states.lock().await;
            log(&format!("Looking for pool with tokens {} and {}", token0_address, token1_address));
            log(&format!("Total pools available: {}", states.len()));

            if let Some((state, comp)) = states
                .values()
                .find(|(_, comp)| {
                    let pool_tokens: Vec<String> = comp.tokens.iter()
                        .map(|t| normalize_address(&t.address.to_string()))
                        .collect();
                    log(&format!("Checking pool with tokens: {:?}", pool_tokens));
                    pool_tokens.contains(&token0_address) && pool_tokens.contains(&token1_address)
                })
                .map(|(state, comp)| (state.clone(), comp.clone())) {
                log(&format!("Found pool with {} tokens", comp.tokens.len()));
                let spot_price = state.spot_price(token0, token1)
                    .map_err(|e| Error::from_reason(format!("Failed to get spot price: {}", e)))?;
                
                Ok(spot_price)
            } else {
                Err(Error::from_reason(format!("No pool found for pair {}-{}", token0_address, token1_address)))
            }
        })
    }

    #[napi(js_name = "getAmountOut")]
    pub fn get_amount_out(&self, token_in_address: String, token_out_address: String, amounts_in: Vec<BigInt>) -> Result<Vec<AmountOutResult>> {
        let runtime = tokio::runtime::Runtime::new()
            .map_err(|e| Error::from_reason(format!("Failed to create runtime: {}", e)))?;
        runtime.block_on(async {
            let token_in_address = normalize_address(&token_in_address);
            let token_out_address = normalize_address(&token_out_address);

            let token_in_bytes = Bytes::from_str(&token_in_address)
                .map_err(|e| Error::from_reason(format!("Invalid token_in address: {}", e)))?;
            let token_out_bytes = Bytes::from_str(&token_out_address)
                .map_err(|e| Error::from_reason(format!("Invalid token_out address: {}", e)))?;

            let token_in = self.tokens
                .get(&token_in_bytes)
                .ok_or_else(|| Error::from_reason(format!("Token not found: {}", token_in_address)))?;

            let token_out = self.tokens
                .get(&token_out_bytes)
                .ok_or_else(|| Error::from_reason(format!("Token not found: {}", token_out_address)))?;

            let states = self.states.lock().await;
            let mut results = Vec::new();

            // Find all pools that contain both tokens
            for (id, (state, comp)) in states.iter() {
                let pool_tokens: Vec<String> = comp.tokens.iter()
                    .map(|t| normalize_address(&t.address.to_string()))
                    .collect();
                
                if pool_tokens.contains(&token_in_address) && pool_tokens.contains(&token_out_address) {
                    let mut amounts_out = Vec::new();
                    let mut gas_used = Vec::new();

                    for amount_in in amounts_in.iter() {
                        // Convert NAPI BigInt to BigUint
                        let (negative, words, _) = amount_in.get_u64();
                        if negative {
                            return Err(Error::from_reason("Amount cannot be negative"));
                        }
                        let amount_in_biguint = BigUint::from(words);

                        let result = state.get_amount_out(amount_in_biguint, token_in, token_out)
                            .map_err(|e| Error::from_reason(format!("Failed to get amount out: {}", e)))?;
                        
                        // Convert result amount to NAPI BigInt
                        let amount_out_u64 = result.amount.to_u64()
                            .ok_or_else(|| Error::from_reason("Amount too large for u64"))?;
                        let amount_out = BigInt::from(amount_out_u64);

                        // Convert gas (BigUint) to u64 first, then to NAPI BigInt
                        let gas_u64 = result.gas.to_u64()
                            .ok_or_else(|| Error::from_reason("Gas value too large for u64"))?;
                        let gas = BigInt::from(gas_u64);

                        log(&format!("Amount in: {:?}, Amount out: {:?}, Gas: {}", 
                            words, result.amount, gas_u64));
                        
                        amounts_out.push(amount_out);
                        gas_used.push(gas);
                    }

                    results.push(AmountOutResult {
                        pool: id.clone(),
                        amountsOut: amounts_out,
                        gasUsed: gas_used,
                    });
                }
            }

            if results.is_empty() {
                return Err(Error::from_reason(format!("No pools found for pair {}-{}", token_in_address, token_out_address)));
            }

            Ok(results)
        })
    }
}

fn normalize_address(address: &str) -> String {
    address.trim_start_matches("0x").to_lowercase()
}

fn log(msg: &str) {
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("tycho_node.log")
    {
        if let Err(e) = writeln!(file, "{}", msg) {
            eprintln!("Failed to write to log file: {}", e);
        }
    } else {
        eprintln!("Failed to open log file");
    }
} 