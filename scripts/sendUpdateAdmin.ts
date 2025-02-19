import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    if (provider.sender().address === undefined) {
        throw new Error('sender address is undefined');
    }

    const ui = provider.ui();
    const ktonMinterAddress = await ui.inputAddress('kton contract address:');

    const minter = provider.open(JettonMinter.createFromAddress(ktonMinterAddress));

    const { adminAddress } = await minter.getData();

    if (adminAddress === undefined) {
        throw new Error('admin address is undefined');
    }

    await ui.prompt(`current admin address = ${adminAddress!.toString({ bounceable: false })}`);

    const adminNew = await ui.inputAddress('new admin address:');

    await ui.prompt(`admin will be updated to ${adminNew.toString({ bounceable: false })}}`);

    await minter.sendChangeAdmin(provider.sender(), adminNew);
}
