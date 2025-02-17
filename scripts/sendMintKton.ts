import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    if (provider.sender().address === undefined) {
        throw new Error('sender address is undefined');
    }

    const ui = provider.ui();
    const ktonMinterAddress = await ui.inputAddress('kton contract address:');

    const minter = provider.open(JettonMinter.createFromAddress(ktonMinterAddress));

    const { mintExchangeRate } = await minter.getExchangeRates();

    await ui.prompt(`current mint exchange rate = 1 : ${Number(mintExchangeRate) / 1000000000}`);

    const amount = await ui.input('mint kton amount (nano KTON):');
    const amountBn = BigInt(amount);

    const fee = 100000000n;
    await ui.prompt(
        `mint ${amount} kton costs ${(Number(amount) * Number(mintExchangeRate)) / 1000000000} + ${fee} TON`,
    );

    await minter.sendMint(provider.sender(), provider.sender().address!, amountBn, {
        value: (amountBn * mintExchangeRate) / 1000000000n + fee,
        notify: {
            amount: 1n,
        },
        returnExcess: true,
    });
}
