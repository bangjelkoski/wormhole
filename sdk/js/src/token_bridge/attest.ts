import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  PublicKeyInitData,
  Transaction,
} from "@solana/web3.js";
import { MsgExecuteContractCompat as MsgExecuteContractInjective } from "@injectivelabs/sdk-ts";
import { ethers, PayableOverrides } from "ethers";
import { Bridge__factory } from "../ethers-contracts";
import { createBridgeFeeTransferInstruction } from "../solana";
import { createAttestTokenInstruction } from "../solana/tokenBridge";
import { createNonce } from "../utils/createNonce";
import { isNativeDenomInjective } from "../cosmwasm";

export async function attestFromEth(
  tokenBridgeAddress: string,
  signer: ethers.Signer,
  tokenAddress: string,
  overrides: PayableOverrides & { from?: string | Promise<string> } = {}
): Promise<ethers.ContractReceipt> {
  const bridge = Bridge__factory.connect(tokenBridgeAddress, signer);
  const v = await bridge.attestToken(tokenAddress, createNonce(), overrides);
  const receipt = await v.wait();
  return receipt;
}

/**
 * Creates attestation message
 * @param tokenBridgeAddress Address of Inj token bridge contract
 * @param walletAddress Address of wallet in inj format
 * @param asset Name or address of the asset to be attested
 * For native assets the asset string is the denomination.
 * For foreign assets the asset string is the inj address of the foreign asset
 * @returns Message to be broadcast
 */
export async function attestFromInjective(
  tokenBridgeAddress: string,
  walletAddress: string,
  asset: string
): Promise<MsgExecuteContractInjective> {
  const nonce = Math.round(Math.random() * 100000);
  const isNativeAsset = isNativeDenomInjective(asset);
  return MsgExecuteContractInjective.fromJSON({
    contractAddress: tokenBridgeAddress,
    sender: walletAddress,
    exec: {
      msg: {
        asset_info: isNativeAsset
          ? {
              native_token: { denom: asset },
            }
          : {
              token: {
                contract_addr: asset,
              },
            },
        nonce: nonce,
      },
      action: "create_asset_meta",
    },
  });
}

export async function attestFromSolana(
  connection: Connection,
  bridgeAddress: PublicKeyInitData,
  tokenBridgeAddress: PublicKeyInitData,
  payerAddress: PublicKeyInitData,
  mintAddress: PublicKeyInitData,
  commitment?: Commitment
): Promise<Transaction> {
  const nonce = createNonce().readUInt32LE(0);
  const transferIx = await createBridgeFeeTransferInstruction(
    connection,
    bridgeAddress,
    payerAddress
  );
  const messageKey = Keypair.generate();
  const attestIx = createAttestTokenInstruction(
    tokenBridgeAddress,
    bridgeAddress,
    payerAddress,
    mintAddress,
    messageKey.publicKey,
    nonce
  );
  const transaction = new Transaction().add(transferIx, attestIx);
  const { blockhash } = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new PublicKey(payerAddress);
  transaction.partialSign(messageKey);
  return transaction;
}
