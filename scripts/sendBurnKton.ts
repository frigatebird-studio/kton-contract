import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    if (provider.sender().address === undefined) {
        throw new Error('sender address is undefined');
    }

    const ui = provider.ui();
    const ktonMinterAddress = await ui.inputAddress('kton contract address:');

    const minter = provider.open(JettonMinter.createFromAddress(ktonMinterAddress));
    const wallet = await minter.getWallet(provider.sender().address!);

    const { burnExchangeRate } = await minter.getExchangeRates();

    await ui.prompt(`current burn exchange rate = 1 : ${Number(burnExchangeRate) / 1000000000}`);

    const amount = await ui.input('burn kton amount (nano KTON):');
    const amountBn = BigInt(amount);

    const fee = 50000000n;
    await ui.prompt(
        `burn costs ${fee} TON and ${amount} kton, and will receive at least ${(Number(amount) * Number(burnExchangeRate)) / 1000000000} ton`,
    );

    await wallet.sendBurn(provider.sender(), amountBn, {
        value: fee,
        returnExcess: true,
    });
}
