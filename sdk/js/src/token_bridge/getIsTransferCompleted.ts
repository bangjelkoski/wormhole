import { ChainGrpcWasmApi } from "@injectivelabs/sdk-ts";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { ethers } from "ethers";
import { fromUint8Array } from "js-base64";
import { parseSmartContractStateResponse } from "..";

import { getSignedVAAHash } from "../bridge";
import { Bridge__factory } from "../ethers-contracts";
import { getClaim } from "../solana/wormhole";
import { parseVaa, SignedVaa } from "../vaa/wormhole";

export async function getIsTransferCompletedEth(
  tokenBridgeAddress: string,
  provider: ethers.Signer | ethers.providers.Provider,
  signedVAA: Uint8Array
): Promise<boolean> {
  const tokenBridge = Bridge__factory.connect(tokenBridgeAddress, provider);
  const signedVAAHash = getSignedVAAHash(signedVAA);
  return await tokenBridge.isTransferCompleted(signedVAAHash);
}

/**
 * Return if the VAA has been redeemed or not
 * @param tokenBridgeAddress The Injective token bridge contract address
 * @param signedVAA The signed VAA byte array
 * @param client Holds the wallet and signing information
 * @returns true if the VAA has been redeemed.
 */
export async function getIsTransferCompletedInjective(
  tokenBridgeAddress: string,
  signedVAA: Uint8Array,
  client: ChainGrpcWasmApi
): Promise<boolean> {
  const queryResult = await client.fetchSmartContractState(
    tokenBridgeAddress,
    Buffer.from(
      JSON.stringify({
        is_vaa_redeemed: {
          vaa: fromUint8Array(signedVAA),
        },
      })
    ).toString("base64")
  );
  const parsed = parseSmartContractStateResponse(queryResult);
  return parsed.is_redeemed;
}

export async function getIsTransferCompletedSolana(
  tokenBridgeAddress: PublicKeyInitData,
  signedVAA: SignedVaa,
  connection: Connection,
  commitment?: Commitment
): Promise<boolean> {
  const parsed = parseVaa(signedVAA);
  return getClaim(
    connection,
    tokenBridgeAddress,
    parsed.emitterAddress,
    parsed.emitterChain,
    parsed.sequence,
    commitment
  ).catch((e) => false);
}
