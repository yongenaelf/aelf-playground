import {
  Commitment,
  PublicKey,
  RecentPrioritizationFees,
} from "@solana/web3.js";
// @ts-ignore
import AElf from "aelf-sdk";

interface Contract {}

interface GetBalanceParams {
  owner: string;
  symbol: string;
}

interface GetBalanceResponse extends GetBalanceParams {
  balance: string;
}

interface TokenContract extends Contract {
  GetBalance: {
    call: (params: GetBalanceParams) => Promise<GetBalanceResponse>;
  };
}

interface GenesisContract extends Contract {
  GetContractAddressByName: {
    call: (params: string) => Promise<string>;
  };
  DeployUserSmartContract: (params: {
    category: 0;
    code: Buffer;
  }) => Promise<{ TransactionId: string }>;
}

interface AElfChain {
  chain: {
    getTxResult: (txId: string) => Promise<{}>;
  };
}

export class ConnectionAElf {
  endpoint;
  genesisContract: GenesisContract | undefined;
  tokenContract: TokenContract | undefined;
  aelf: AElfChain;

  constructor(endpoint: string = "https://tdvw-test-node.aelf.io") {
    this.endpoint = endpoint;
    const aelf = new AElf(new AElf.providers.HttpProvider(endpoint));
    this.aelf = aelf;
    const newWallet = AElf.wallet.createNewWallet();

    const tokenContractName = "AElf.ContractNames.Token";
    let tokenContractAddress;
    (async () => {
      // get chain status
      const chainStatus = await aelf.chain.getChainStatus();
      // get genesis contract address
      const GenesisContractAddress = chainStatus.GenesisContractAddress;
      // get genesis contract instance
      this.genesisContract = await aelf.chain.contractAt(
        GenesisContractAddress,
        newWallet
      );

      if (!this.genesisContract)
        throw new Error("Error initializing Genesis Contract.");

      // Get contract address by the read only method `GetContractAddressByName` of genesis contract
      tokenContractAddress =
        await this.genesisContract.GetContractAddressByName.call(
          AElf.utils.sha256(tokenContractName)
        );
      this.tokenContract = (await aelf.chain.contractAt(
        tokenContractAddress,
        newWallet
      )) as TokenContract;

      if (!this.tokenContract)
        throw new Error("Error initializing Token Contract.");

      console.log("ConnectionAElf initialized.");
    })();
  }

  get rpcEndpoint() {
    return this.endpoint || "https://tdvw-test-node.aelf.io";
  }

  async confirmTransaction(txHash: string, commitment?: string) {
    return {
      value: {
        err: null,
      },
    };
  }

  async sendRawTransaction(serializedTransaction: Buffer, opts: any) {
    return "";
  }

  async getLatestBlockhash() {
    return {
      blockhash: "",
    };
  }

  async getRecentPrioritizationFees() {
    return [] as RecentPrioritizationFees[];
  }

  async getAccountInfo(idlPk: PublicKey) {
    return {
      data: Buffer.from(""),
    };
  }

  async getSlot() {
    return 0;
  }

  get commitment() {
    return undefined as Commitment | undefined;
  }

  async getSignaturesForAddress(idlPk: PublicKey, opts: any) {
    return [];
  }

  async getBalance(address: string) {
    if (!this.tokenContract) return 0;

    const res = await this.tokenContract?.GetBalance.call({
      symbol: "ELF",
      owner: address,
    });

    return Number(res?.balance || 0);
  }

  removeAccountChangeListener(id: number) {}

  onAccountChange(idlPk: PublicKey, callback: (acc: any) => void) {
    return 0;
  }

  async requestAirdrop(address: string) {
    const res = await fetch(
      `https://faucet.aelf.dev/api/claim?walletAddress=${address}`,
      {
        method: "POST",
      }
    );

    const data: { isSuccess: boolean; code: number; message: string } =
      await res.json();

    if (data.isSuccess === false) {
      throw new Error(data.message);
    }

    return data.message;
  }

  async getMinimumBalanceForRentExemption(size: number) {
    return 0;
  }

  async deploy(code: Buffer) {
    const res = await this.genesisContract?.DeployUserSmartContract({
      category: 0,
      code,
    });

    if (res) {
      try {
        const txResult = await this.aelf.chain.getTxResult(res.TransactionId);
        console.log(txResult);
      } catch (err: unknown) {
        throw err as ErrorInterface;
      }
    }

    return null;
  }
}

export interface ErrorInterface {
  TransactionId: string;
  Status: string;
  Logs: [];
  Bloom: null;
  BlockNumber: 0;
  BlockHash: null;
  Transaction: null;
  ReturnValue: "";
  Error: string;
  TransactionSize: 0;
}

export function convertAElfErrorMessages(err: ErrorInterface) {
  return `\nTransaction ID: ${err.TransactionId}\nError: ${err.Error}`;
}