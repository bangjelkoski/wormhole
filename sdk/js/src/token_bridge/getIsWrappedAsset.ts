import { ChainGrpcWasmApi } from "@injectivelabs/sdk-ts";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { ethers } from "ethers";
import { Bridge__factory } from "../ethers-contracts";
import { CHAIN_ID_INJECTIVE, tryNativeToHexString } from "../utils";
import { getWrappedMeta } from "../solana/tokenBridge";
import { getForeignAssetInjective } from "./getForeignAsset";

/**
 * Returns whether or not an asset address on Ethereum is a wormhole wrapped asset
 * @param tokenBridgeAddress
 * @param provider
 * @param assetAddress
 * @returns
 */
export async function getIsWrappedAssetEth(
  tokenBridgeAddress: string,
  provider: ethers.Signer | ethers.providers.Provider,
  assetAddress: string
): Promise<boolean> {
  if (!assetAddress) return false;
  const tokenBridge = Bridge__factory.connect(tokenBridgeAddress, provider);
  return await tokenBridge.isWrappedAsset(assetAddress);
}

/**
 * Checks if the asset is a wrapped asset
 * @param tokenBridgeAddress The address of the Injective token bridge contract
 * @param client Connection/wallet information
 * @param assetAddress Address of the asset in Injective format
 * @returns true if asset is a wormhole wrapped asset
 */
export async function getIsWrappedAssetInjective(
  tokenBridgeAddress: string,
  client: ChainGrpcWasmApi,
  assetAddress: string
): Promise<boolean> {
  const hexified = tryNativeToHexString(assetAddress, "injective");
  const result = await getForeignAssetInjective(
    tokenBridgeAddress,
    client,
    CHAIN_ID_INJECTIVE,
    new Uint8Array(Buffer.from(hexified))
  );
  if (result === null) {
    return false;
  }
  return true;
}

/**
 * Returns whether or not an asset on Solana is a wormhole wrapped asset
 * @param connection
 * @param tokenBridgeAddress
 * @param mintAddress
 * @param [commitment]
 * @returns
 */
export async function getIsWrappedAssetSolana(
  connection: Connection,
  tokenBridgeAddress: PublicKeyInitData,
  mintAddress: PublicKeyInitData,
  commitment?: Commitment
): Promise<boolean> {
  if (!mintAddress) {
    return false;
  }
  return getWrappedMeta(connection, tokenBridgeAddress, mintAddress, commitment)
    .catch((_) => null)
    .then((meta) => meta != null);
}

export const getIsWrappedAssetSol = getIsWrappedAssetSolana;
