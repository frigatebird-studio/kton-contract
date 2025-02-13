import { Address, Builder, Cell, Slice } from '@ton/core';

export type JettonMinterContent = {
    totalSupply?: bigint;
    admin: Address;
    content: Cell;
    jettonWalletCode: Cell;
    mintExchangeRate: bigint;
    burnExchangeRate: bigint;
    mintable: boolean;
    burnable: boolean;
};

export function storeJettonMinterContent(src: JettonMinterContent) {
    return (builder: Builder) => {
        builder.storeCoins(src.totalSupply ?? 0n);
        builder.storeAddress(src.admin);
        builder.storeRef(src.content);
        builder.storeRef(src.jettonWalletCode);
        builder.storeUint(src.mintExchangeRate, 64);
        builder.storeUint(src.burnExchangeRate, 64);
        builder.storeBit(src.mintable);
        builder.storeBit(src.burnable);
    };
}

export function loadJettonMinterContent(slice: Slice): JettonMinterContent {
    const totalSupply = slice.loadCoins();
    const adminAddress = slice.loadAddress();
    const jettonContent = slice.loadRef();
    const jettonWalletCode = slice.loadRef();
    const mintExchangeRate = slice.loadUintBig(64);
    const burnExchangeRate = slice.loadUintBig(64);
    const mintable = slice.loadBit();
    const burnable = slice.loadBit();

    return {
        totalSupply,
        admin: adminAddress,
        content: jettonContent,
        jettonWalletCode,
        mintExchangeRate,
        burnExchangeRate,
        mintable,
        burnable,
    };
}
