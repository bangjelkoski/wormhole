import {
  ACCOUNT_SIZE,
  createCloseAccountInstruction,
  createInitializeAccountInstruction,
  createTransferInstruction,
  getMinimumBalanceForRentExemptAccount,
  getMint,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  PublicKeyInitData,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { ethers, Overrides } from "ethers";
import { fromUint8Array } from "js-base64";
import { Bridge__factory } from "../ethers-contracts";
import { CHAIN_ID_SOLANA, MAX_VAA_DECIMALS } from "../utils";
import { MsgExecuteContractCompat as MsgExecuteContractInjective } from "@injectivelabs/sdk-ts";
import {
  createCompleteTransferNativeInstruction,
  createCompleteTransferWrappedInstruction,
} from "../solana/tokenBridge";
import { SignedVaa, parseTokenTransferVaa } from "../vaa";

export async function redeemOnEth(
  tokenBridgeAddress: string,
  signer: ethers.Signer,
  signedVAA: Uint8Array,
  overrides: Overrides & { from?: string | Promise<string> } = {}
) {
  const bridge = Bridge__factory.connect(tokenBridgeAddress, signer);
  const v = await bridge.completeTransfer(signedVAA, overrides);
  const receipt = await v.wait();
  return receipt;
}

export async function redeemOnEthNative(
  tokenBridgeAddress: string,
  signer: ethers.Signer,
  signedVAA: Uint8Array,
  overrides: Overrides & { from?: string | Promise<string> } = {}
) {
  const bridge = Bridge__factory.connect(tokenBridgeAddress, signer);
  const v = await bridge.completeTransferAndUnwrapETH(signedVAA, overrides);
  const receipt = await v.wait();
  return receipt;
}

/**
 * Submits the supplied VAA to Injective
 * @param tokenBridgeAddress Address of Inj token bridge contract
 * @param walletAddress Address of wallet in inj format
 * @param signedVAA VAA with the attestation message
 * @returns Message to be broadcast
 */
export async function submitVAAOnInjective(
  tokenBridgeAddress: string,
  walletAddress: string,
  signedVAA: Uint8Array
): Promise<MsgExecuteContractInjective> {
  return MsgExecuteContractInjective.fromJSON({
    contractAddress: tokenBridgeAddress,
    sender: walletAddress,
    exec: {
      msg: {
        data: fromUint8Array(signedVAA),
      },
      action: "submit_vaa",
    },
  });
}
export const redeemOnInjective = submitVAAOnInjective;

export async function redeemAndUnwrapOnSolana(
  connection: Connection,
  bridgeAddress: PublicKeyInitData,
  tokenBridgeAddress: PublicKeyInitData,
  payerAddress: PublicKeyInitData,
  signedVaa: SignedVaa,
  commitment?: Commitment
) {
  const parsed = parseTokenTransferVaa(signedVaa);
  const targetPublicKey = new PublicKey(parsed.to);
  const targetAmount = await getMint(connection, NATIVE_MINT, commitment).then(
    (info) =>
      parsed.amount * BigInt(Math.pow(10, info.decimals - MAX_VAA_DECIMALS))
  );
  const rentBalance = await getMinimumBalanceForRentExemptAccount(
    connection,
    commitment
  );
  if (Buffer.compare(parsed.tokenAddress, NATIVE_MINT.toBuffer()) != 0) {
    return Promise.reject("tokenAddress != NATIVE_MINT");
  }
  const payerPublicKey = new PublicKey(payerAddress);
  const ancillaryKeypair = Keypair.generate();

  const completeTransferIx = createCompleteTransferNativeInstruction(
    tokenBridgeAddress,
    bridgeAddress,
    payerPublicKey,
    signedVaa
  );

  //This will create a temporary account where the wSOL will be moved
  const createAncillaryAccountIx = SystemProgram.createAccount({
    fromPubkey: payerPublicKey,
    newAccountPubkey: ancillaryKeypair.publicKey,
    lamports: rentBalance, //spl token accounts need rent exemption
    space: ACCOUNT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  });

  //Initialize the account as a WSOL account, with the original payerAddress as owner
  const initAccountIx = createInitializeAccountInstruction(
    ancillaryKeypair.publicKey,
    NATIVE_MINT,
    payerPublicKey
  );

  //Send in the amount of wSOL which we want converted to SOL
  const balanceTransferIx = createTransferInstruction(
    targetPublicKey,
    ancillaryKeypair.publicKey,
    payerPublicKey,
    targetAmount.valueOf()
  );

  //Close the ancillary account for cleanup. Payer address receives any remaining funds
  const closeAccountIx = createCloseAccountInstruction(
    ancillaryKeypair.publicKey, //account to close
    payerPublicKey, //Remaining funds destination
    payerPublicKey //authority
  );

  const { blockhash } = await connection.getLatestBlockhash(commitment);
  const transaction = new Transaction();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payerPublicKey;
  transaction.add(
    completeTransferIx,
    createAncillaryAccountIx,
    initAccountIx,
    balanceTransferIx,
    closeAccountIx
  );
  transaction.partialSign(ancillaryKeypair);
  return transaction;
}

export async function redeemOnSolana(
  connection: Connection,
  bridgeAddress: PublicKeyInitData,
  tokenBridgeAddress: PublicKeyInitData,
  payerAddress: PublicKeyInitData,
  signedVaa: SignedVaa,
  feeRecipientAddress?: PublicKeyInitData,
  commitment?: Commitment
) {
  const parsed = parseTokenTransferVaa(signedVaa);
  const createCompleteTransferInstruction =
    parsed.tokenChain == CHAIN_ID_SOLANA
      ? createCompleteTransferNativeInstruction
      : createCompleteTransferWrappedInstruction;
  const transaction = new Transaction().add(
    createCompleteTransferInstruction(
      tokenBridgeAddress,
      bridgeAddress,
      payerAddress,
      parsed,
      feeRecipientAddress
    )
  );
  const { blockhash } = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new PublicKey(payerAddress);
  return transaction;
}
