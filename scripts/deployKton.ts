import { beginCell, toNano } from '@ton/core';
import { JettonMinter, JettonMinterConfig } from '../wrappers/JettonMinter';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const adminAddress = await ui.inputAddress('admin address');
    const contentUrl = await ui.input('content URL');
    const jettonWalletCodeCell = await compile('JettonWallet');

    const jettonConfig: JettonMinterConfig = {
        admin: adminAddress,
        content: beginCell().storeUint(1, 8).storeStringTail(contentUrl).endCell(),
        jettonWalletCode: jettonWalletCodeCell,
        mintExchangeRate: 1000000000n,
        burnExchangeRate: 1000000000n,
        mintable: true,
        burnable: false,
    };

    const minter = provider.open(JettonMinter.createFromConfig(jettonConfig, await compile('JettonMinter')));

    await minter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(minter.address);
}
