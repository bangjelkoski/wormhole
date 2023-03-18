import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { ChainGrpcWasmApi } from "@injectivelabs/sdk-ts";
import { ethers } from "ethers";
import { fromUint8Array } from "js-base64";
import { Bridge__factory } from "../ethers-contracts";
import { deriveWrappedMintKey, getWrappedMeta } from "../solana/tokenBridge";
import {
  ChainId,
  ChainName,
  CHAIN_ID_ALGORAND,
  coalesceChainId,
  parseSmartContractStateResponse,
} from "../utils";

/**
 * Returns a foreign asset address on Ethereum for a provided native chain and asset address, AddressZero if it does not exist
 * @param tokenBridgeAddress
 * @param provider
 * @param originChain
 * @param originAsset zero pad to 32 bytes
 * @returns
 */
export async function getForeignAssetEth(
  tokenBridgeAddress: string,
  provider: ethers.Signer | ethers.providers.Provider,
  originChain: ChainId | ChainName,
  originAsset: Uint8Array
): Promise<string | null> {
  const tokenBridge = Bridge__factory.connect(tokenBridgeAddress, provider);
  try {
    return await tokenBridge.wrappedAsset(
      coalesceChainId(originChain),
      originAsset
    );
  } catch (e) {
    return null;
  }
}

/**
 * Returns the address of the foreign asset
 * @param tokenBridgeAddress Address of token bridge contact
 * @param client Holds the wallet and signing information
 * @param originChain The chainId of the origin of the asset
 * @param originAsset The address of the origin asset
 * @returns The foreign asset address or null
 */
export async function getForeignAssetInjective(
  tokenBridgeAddress: string,
  client: ChainGrpcWasmApi,
  originChain: ChainId | ChainName,
  originAsset: Uint8Array
): Promise<string | null> {
  try {
    const queryResult = await client.fetchSmartContractState(
      tokenBridgeAddress,
      Buffer.from(
        JSON.stringify({
          wrapped_registry: {
            chain: coalesceChainId(originChain),
            address: fromUint8Array(originAsset),
          },
        })
      ).toString("base64")
    );
    const parsed = parseSmartContractStateResponse(queryResult);
    return parsed.address;
  } catch (e) {
    return null;
  }
}

/**
 * Returns a foreign asset address on Solana for a provided native chain and asset address
 * @param connection
 * @param tokenBridgeAddress
 * @param originChain
 * @param originAsset zero pad to 32 bytes
 * @param [commitment]
 * @returns
 */
export async function getForeignAssetSolana(
  connection: Connection,
  tokenBridgeAddress: PublicKeyInitData,
  originChain: ChainId | ChainName,
  originAsset: Uint8Array,
  commitment?: Commitment
): Promise<string | null> {
  const mint = deriveWrappedMintKey(
    tokenBridgeAddress,
    coalesceChainId(originChain) as number,
    originAsset
  );
  return getWrappedMeta(connection, tokenBridgeAddress, mint, commitment)
    .catch((_) => null)
    .then((meta) => (meta === null ? null : mint.toString()));
}
