import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    if (provider.sender().address === undefined) {
        throw new Error('sender address is undefined');
    }

    const ui = provider.ui();
    const ktonMinterAddress = await ui.inputAddress('kton contract address:');

    const minter = provider.open(JettonMinter.createFromAddress(ktonMinterAddress));

    const { mintExchangeRate, burnExchangeRate } = await minter.getExchangeRates();

    await ui.prompt(
        `current mint exchange rate = 1 : ${Number(mintExchangeRate) / 1000000000}\ncurrent burn exchange rate = 1 : ${Number(burnExchangeRate) / 1000000000}`,
    );

    const mintExchangeRateNew = await ui.input('new mint exchange rate:');
    const burnExchangeRateNew = await ui.input('new burn exchange rate:');

    await ui.prompt(
        `mint exchange rate will be updated to 1 : ${Number(mintExchangeRateNew) / 1000000000}\nburn exchange rate will be updated to 1 : ${Number(burnExchangeRateNew) / 1000000000}`,
    );

    await minter.sendChangeExchangeRates(provider.sender(), BigInt(mintExchangeRateNew), BigInt(burnExchangeRateNew));
}
