import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    StateInit,
    toNano,
    TupleBuilder,
} from '@ton/core';
import { JettonWallet } from './JettonWallet';
import { ContentResolver, loadFullContent } from './common/content';
import { parseJettonContent } from './content';
import { parseExcessReturnOptions, parseNotifyOptions, SendTransferOptions } from './common/types';
import { storeJettonMintMessage } from './types/JettonMintMessage';
import { JettonMinterContent, storeJettonMinterContent } from './types/JettonMinterContent';
import { storeJettonChangeAdminMessage } from './types/JettonChangeAdminMessage';
import { storeJettonChangeContentMessage } from './types/JettonChangeContentMessage';
import { JettonMinterAction, parseJettonMinterTransaction } from './types/JettonMinterAction';
import { JettonMinterData, JettonMinterExchangeRates } from './types/JettonMinterData';
import { JETTON_PROVIDE_WALLET_ADDRESS } from './opcodes';

export type JettonMinterConfig = JettonMinterContent;

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell().store(storeJettonMinterContent(config)).endCell();
}

export interface IPrepare {
    sendToAddress: Address;
    payload: Cell;
    value?: bigint;
    stateInit?: StateInit;
}

const TON_DECIMALS = 1000000000n;

export function prepareMint(
    sender: Sender,
    minterAddress: Address,
    recipient: Address,
    amount: bigint,
    options?: SendTransferOptions & {
        value?: bigint;
        queryId?: bigint;
    },
    expectedFee: bigint = toNano('0.08'),
    mintExchangeRate?: bigint,
): IPrepare {
    const notification = parseNotifyOptions(options?.notify);
    const excessReturn = parseExcessReturnOptions(options?.returnExcess, sender);

    const boc = beginCell()
        .store(
            storeJettonMintMessage({
                queryId: options?.queryId ?? 0n,
                amount: amount,
                from: minterAddress,
                to: recipient,
                responseAddress: excessReturn?.address ?? null,
                forwardPayload: notification?.payload ?? null,
                forwardTonAmount: notification?.amount ?? 0n,
                walletForwardValue:
                    (notification?.amount ?? 0n) + (excessReturn ? toNano('0.01') : 0n) + toNano('0.02'),
            }),
        )
        .endCell();
    const preparedPayload: IPrepare = {
        sendToAddress: minterAddress,
        payload: boc,
    };
    if (mintExchangeRate) {
        preparedPayload.value = (amount * mintExchangeRate) / TON_DECIMALS + expectedFee;
    }

    return preparedPayload;
}

export function prepareChangeOwner(minterAddress: Address, newAdmin: Address,
    options?: {
        value?: bigint;
        queryId?: bigint;
    }): IPrepare {
    const payload = beginCell()
        .store(
            storeJettonChangeAdminMessage({
                queryId: options?.queryId ?? 0n,
                newAdmin: newAdmin,
            }),
        )
        .endCell()
    return { sendToAddress: minterAddress, payload, value: options?.value ?? toNano('0.01') };
}

export function prepareChangeContent(minterAddress: Address, newContent: Cell,
    options?: {
        value?: bigint;
        queryId?: bigint;
    }): IPrepare {
    const payload = beginCell()
        .store(
            storeJettonChangeContentMessage({
                queryId: options?.queryId ?? 0n,
                newContent: newContent,
            }),
        )
        .endCell()
    return { sendToAddress: minterAddress, payload, value: options?.value ?? toNano('0.01') };
}

export function prepareChangeExchangeRates(minterAddress: Address, newMintExchangeRate: bigint, newBurnExchangeRate: bigint,
    options?: {
        value?: bigint;
        queryId?: bigint;
    }): IPrepare {
    const payload = beginCell()
        .storeUint(5, 32)
        .storeUint(options?.queryId ?? 0, 64)
        .storeUint(newMintExchangeRate, 64)
        .storeUint(newBurnExchangeRate, 64)
        .endCell()

    return { sendToAddress: minterAddress, payload, value: options?.value ?? toNano('0.01') };
}

export function prepareChangeEnables(minterAddress: Address, isMintable: boolean, isBurnable: boolean,
    options?: {
        value?: bigint;
        queryId?: bigint;
    }): IPrepare {
    const payload = beginCell()
        .storeUint(6, 32)
        .storeUint(options?.queryId ?? 0, 64)
        .storeBit(isMintable)
        .storeBit(isBurnable)
        .endCell()

    return { sendToAddress: minterAddress, payload, value: options?.value ?? toNano('0.01') };
}

export function prepareWithdrawAll(minterAddress: Address, options?: {
    value?: bigint;
    queryId?: bigint;
}): IPrepare {
    const payload = beginCell()
        .storeUint(7, 32)
        .storeUint(options?.queryId ?? 0, 64)
        .endCell()

    return { sendToAddress: minterAddress, payload, value: options?.value ?? toNano('0.01') };
}

export class JettonMinter implements Contract {
    constructor(
        public readonly address: Address,
        public readonly init?: StateInit,
        public readonly contentResolver?: ContentResolver,
    ) { }

    static createFromAddress(address: Address, contentResolver?: ContentResolver): JettonMinter {
        return new JettonMinter(address, undefined, contentResolver);
    }

    static createFromConfig(
        config: JettonMinterConfig,
        code: Cell,
        workchain?: number,
        contentResolver?: ContentResolver,
    ) {
        const data = jettonMinterConfigToCell(config);
        const init = { data, code: code };
        return new JettonMinter(contractAddress(workchain ?? 0, init), init, contentResolver);
    }

    async sendDeploy(provider: ContractProvider, sender: Sender, value?: bigint) {
        await provider.internal(sender, {
            value: value ?? toNano('0.05'),
            bounce: true,
        });
    }

    async sendMint(
        provider: ContractProvider,
        sender: Sender,
        recipient: Address,
        amount: bigint,
        options: SendTransferOptions & {
            value: bigint;
            queryId?: bigint;
        },
    ) {
        const preparation = prepareMint(sender, this.address, recipient, amount, options);

        await provider.internal(sender, {
            value: options.value,
            bounce: true,
            body: preparation.payload,
        });
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        sender: Sender,
        newAdmin: Address,
        options?: {
            value?: bigint;
            queryId?: bigint;
        },
    ) {
        const preparation = prepareChangeOwner(this.address, newAdmin, options);

        await provider.internal(sender, {
            value: preparation.value!,
            bounce: true,
            body: preparation.payload,
        });
    }

    async sendChangeContent(
        provider: ContractProvider,
        sender: Sender,
        newContent: Cell,
        options?: {
            value?: bigint;
            queryId?: bigint;
        },
    ) {
        const preparation = prepareChangeContent(this.address, newContent, options);

        await provider.internal(sender, {
            value: preparation.value!,
            bounce: true,
            body: preparation.payload
        });
    }

    async sendChangeExchangeRates(
        provider: ContractProvider,
        sender: Sender,
        newMintExchangeRate: bigint,
        newBurnExchangeRate: bigint,
        options?: {
            value?: bigint;
            queryId?: bigint;
        },
    ) {
        const preparation = prepareChangeExchangeRates(this.address, newMintExchangeRate, newBurnExchangeRate, options);

        await provider.internal(sender, {
            value: preparation.value!,
            bounce: true,
            body: preparation.payload,
        });
    }

    async sendChangeMintableBurnable(
        provider: ContractProvider,
        sender: Sender,
        isMintable: boolean,
        isBurnable: boolean,
        options?: {
            value?: bigint;
            queryId?: bigint;
        },
    ) {
        const preparation = prepareChangeEnables(this.address, isMintable, isBurnable, options);

        await provider.internal(sender, {
            value: preparation.value!,
            bounce: true,
            body: preparation.payload,
        });
    }

    async sendWithdrawAll(
        provider: ContractProvider,
        sender: Sender,
        options?: {
            value?: bigint;
            queryId?: bigint;
        },
    ) {
        const preparation = prepareWithdrawAll(this.address, options);
        await provider.internal(sender, {
            value: preparation.value!,
            bounce: true,
            body: preparation.payload,
        });
    }

    async getData(provider: ContractProvider): Promise<JettonMinterData> {
        const builder = new TupleBuilder();
        const { stack } = await provider.get('get_jetton_data', builder.build());
        return {
            totalSupply: stack.readBigNumber(),
            mintable: stack.readBoolean(),
            adminAddress: stack.readAddressOpt(),
            jettonContent: stack.readCell(),
            jettonWalletCode: stack.readCell(),
        };
    }

    async getExchangeRates(provider: ContractProvider): Promise<JettonMinterExchangeRates> {
        const builder = new TupleBuilder();
        const { stack } = await provider.get('get_exchange_rates', builder.build());
        return {
            mintExchangeRate: stack.readBigNumber(),
            burnExchangeRate: stack.readBigNumber(),
        };
    }

    async getWalletAddress(provider: ContractProvider, owner: Address) {
        const builder = new TupleBuilder();
        builder.writeAddress(owner);
        const { stack } = await provider.get('get_wallet_address', builder.build());
        return stack.readAddress();
    }

    async getIsBurnable(provider: ContractProvider) {
        const { stack } = await provider.get('get_is_burnable', []);
        return stack.readBoolean();
    }

    async getBalance(provider: ContractProvider) {
        const state = await provider.getState();
        return state.balance;
    }

    async sendProvideWalletAddress(
        provider: ContractProvider,
        sender: Sender,
        owner: Address,
        options?: {
            value?: bigint;
            queryId?: bigint;
        },
    ) {
        await provider.internal(sender, {
            value: options?.value ?? toNano('0.05'),
            bounce: true,
            body: beginCell()
                .storeUint(JETTON_PROVIDE_WALLET_ADDRESS, 32)
                .storeUint(options?.queryId ?? 0, 64)
                .storeAddress(owner)
                .storeBit(true)
                .endCell(),
        });
    }

    async getWallet(provider: ContractProvider, owner: Address) {
        const jettonWalletAddress = await this.getWalletAddress(provider, owner);
        return provider.open(new JettonWallet(jettonWalletAddress));
    }

    async getContent(provider: ContractProvider) {
        if (!this.contentResolver) {
            throw new Error('No content resolver');
        }

        const data = await this.getData(provider);
        return parseJettonContent(await loadFullContent(data.jettonContent, this.contentResolver));
    }

    async getActions(
        provider: ContractProvider,
        options?:
            | { lt?: never; hash?: never; limit?: number }
            | {
                lt: bigint;
                hash: Buffer;
                limit?: number;
            },
    ): Promise<JettonMinterAction[]> {
        let { lt, hash, limit } = options ?? {};
        if (!lt || !hash) {
            const state = await provider.getState();
            if (!state.last) {
                return [];
            }

            lt = state.last.lt;
            hash = state.last.hash;
        }

        const transactions = await provider.getTransactions(this.address, lt, hash, limit);

        return transactions.map((tx) => parseJettonMinterTransaction(tx));
    }
}
