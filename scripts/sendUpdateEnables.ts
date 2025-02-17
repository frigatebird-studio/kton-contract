import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    if (provider.sender().address === undefined) {
        throw new Error('sender address is undefined');
    }

    const ui = provider.ui();
    const ktonMinterAddress = await ui.inputAddress('kton contract address:');

    const minter = provider.open(JettonMinter.createFromAddress(ktonMinterAddress));

    const { mintable } = await minter.getData();
    const burnable = await minter.getIsBurnable();

    await ui.prompt(`mintable = ${mintable}\nburnable = ${burnable}`);

    const mintableNew = await ui.choose('is mintable? (yes/no):', [true, false], (x) => (x ? 'yes' : 'no'));
    const burnableNew = await ui.choose('is burnable? (yes/no):', [true, false], (x) => (x ? 'yes' : 'no'));

    await ui.prompt(`mintable will be updated to ${mintableNew}\nburnable will be updated to ${burnableNew}`);

    await minter.sendChangeMintableBurnable(provider.sender(), mintableNew, burnableNew);
}
