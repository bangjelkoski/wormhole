import { ChainGrpcWasmApi } from "@injectivelabs/sdk-ts";
import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
} from "@solana/web3.js";
import { ethers } from "ethers";
import { arrayify, zeroPad } from "ethers/lib/utils";
import { buildTokenId, isNativeCosmWasmDenom } from "../cosmwasm/address";
import { TokenImplementation__factory } from "../ethers-contracts";
import {
  ChainId,
  ChainName,
  CHAIN_ID_INJECTIVE,
  CHAIN_ID_SOLANA,
  coalesceChainId,
  hexToUint8Array,
  parseSmartContractStateResponse,
} from "../utils";
import { getIsWrappedAssetEth } from "./getIsWrappedAsset";
import { getWrappedMeta } from "../solana/tokenBridge";

// TODO: remove `as ChainId` and return number in next minor version as we can't ensure it will match our type definition
export interface WormholeWrappedInfo {
  isWrapped: boolean;
  chainId: ChainId;
  assetAddress: Uint8Array;
}

/**
 * Returns a origin chain and asset address on {originChain} for a provided Wormhole wrapped address
 * @param tokenBridgeAddress
 * @param provider
 * @param wrappedAddress
 * @returns
 */
export async function getOriginalAssetEth(
  tokenBridgeAddress: string,
  provider: ethers.Signer | ethers.providers.Provider,
  wrappedAddress: string,
  lookupChain: ChainId | ChainName
): Promise<WormholeWrappedInfo> {
  const isWrapped = await getIsWrappedAssetEth(
    tokenBridgeAddress,
    provider,
    wrappedAddress
  );
  if (isWrapped) {
    const token = TokenImplementation__factory.connect(
      wrappedAddress,
      provider
    );
    const chainId = (await token.chainId()) as ChainId; // origin chain
    const assetAddress = await token.nativeContract(); // origin address
    return {
      isWrapped: true,
      chainId,
      assetAddress: arrayify(assetAddress),
    };
  }
  return {
    isWrapped: false,
    chainId: coalesceChainId(lookupChain),
    assetAddress: zeroPad(arrayify(wrappedAddress), 32),
  };
}

/**
 * Returns information about the asset
 * @param wrappedAddress Address of the asset in wormhole wrapped format (hex string)
 * @param client WASM api client
 * @returns Information about the asset
 */
export async function getOriginalAssetInjective(
  wrappedAddress: string,
  client: ChainGrpcWasmApi
): Promise<WormholeWrappedInfo> {
  const chainId = CHAIN_ID_INJECTIVE;
  if (isNativeCosmWasmDenom(chainId, wrappedAddress)) {
    return {
      isWrapped: false,
      chainId,
      assetAddress: hexToUint8Array(buildTokenId(chainId, wrappedAddress)),
    };
  }
  try {
    const response = await client.fetchSmartContractState(
      wrappedAddress,
      Buffer.from(
        JSON.stringify({
          wrapped_asset_info: {},
        })
      ).toString("base64")
    );
    const parsed = parseSmartContractStateResponse(response);
    return {
      isWrapped: true,
      chainId: parsed.asset_chain,
      assetAddress: new Uint8Array(Buffer.from(parsed.asset_address, "base64")),
    };
  } catch {}
  return {
    isWrapped: false,
    chainId: chainId,
    assetAddress: hexToUint8Array(buildTokenId(chainId, wrappedAddress)),
  };
}

/**
 * Returns a origin chain and asset address on {originChain} for a provided Wormhole wrapped address
 * @param connection
 * @param tokenBridgeAddress
 * @param mintAddress
 * @param [commitment]
 * @returns
 */
export async function getOriginalAssetSolana(
  connection: Connection,
  tokenBridgeAddress: PublicKeyInitData,
  mintAddress: PublicKeyInitData,
  commitment?: Commitment
): Promise<WormholeWrappedInfo> {
  try {
    const mint = new PublicKey(mintAddress);

    return getWrappedMeta(
      connection,
      tokenBridgeAddress,
      mintAddress,
      commitment
    )
      .catch((_) => null)
      .then((meta) => {
        if (meta === null) {
          return {
            isWrapped: false,
            chainId: CHAIN_ID_SOLANA,
            assetAddress: mint.toBytes(),
          };
        } else {
          return {
            isWrapped: true,
            chainId: meta.chain as ChainId,
            assetAddress: Uint8Array.from(meta.tokenAddress),
          };
        }
      });
  } catch (_) {
    return {
      isWrapped: false,
      chainId: CHAIN_ID_SOLANA,
      assetAddress: new Uint8Array(32),
    };
  }
}

export const getOriginalAssetSol = getOriginalAssetSolana;
