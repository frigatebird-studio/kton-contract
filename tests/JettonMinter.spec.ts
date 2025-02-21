import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot } from '@ton/sandbox';
import { Address, beginCell, Cell, internal, toNano } from '@ton/core';
import { JettonMinter, JettonMinterConfig, prepareMint } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import {
    JETTON_BURN_NOTIFICATION_OPCODE,
    JETTON_BURN_OPCODE,
    JETTON_BURN_REDEEM_OPCODE,
    JETTON_EXCESSES_OPCODE,
    JETTON_PROVIDE_WALLET_ADDRESS,
    JETTON_TAKE_WALLET_ADDRESS,
} from '../wrappers/opcodes';
import { JettonWallet } from '../wrappers/JettonWallet';

// explicitly set fees
const mintFee = toNano('0.08');
const burnFee = toNano('0.05');
const adminOperationFee = toNano('0.01');

describe('JettonMinter', () => {
    let code: Cell;
    let walletCode: Cell;
    let defaultContent: Cell;
    let defaultConfig: JettonMinterConfig;

    let blockchain: Blockchain;
    let blockchainState: BlockchainSnapshot;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;

    beforeAll(async () => {
        code = await compile('JettonMinter');
        walletCode = await compile('JettonWallet');
        defaultContent = beginCell().storeUint(1, 8).storeStringTail('').endCell();
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        defaultConfig = {
            totalSupply: 0n,
            admin: deployer.address,
            content: defaultContent,
            jettonWalletCode: walletCode,
            mintExchangeRate: 2000000000n,
            burnExchangeRate: 500000000n,
            mintable: true,
            burnable: true,
        };

        jettonMinter = blockchain.openContract(JettonMinter.createFromConfig(defaultConfig, code));

        const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });

        blockchainState = blockchain.snapshot();
    });

    beforeEach(async () => {
        blockchain.loadFrom(blockchainState);
    });

    it('should deploy and initialize with correct data', async () => {
        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(0n);
        expect(data.mintable).toBe(true);
        expect(data.adminAddress?.toString()).toBe(deployer.address.toString());
    });

    it('should mint tokens correctly by admin', async () => {
        const recipient = await blockchain.treasury('recipient');
        const mintAmount = toNano('100');
        const payAmount = (mintAmount * defaultConfig.mintExchangeRate) / 1000000000n;

        const mintResult = await jettonMinter.sendMint(deployer.getSender(), recipient.address, mintAmount, {
            value: payAmount + mintFee,
            returnExcess: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            to: deployer.address,
            success: true,
            op: JETTON_EXCESSES_OPCODE,
        });

        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(mintAmount);
    });

    it('should mint tokens correctly by random wallet', async () => {
        const recipient = await blockchain.treasury('random');
        const mintAmount = toNano('100');
        const payAmount = (mintAmount * defaultConfig.mintExchangeRate) / 1000000000n;

        const mintResult = await jettonMinter.sendMint(recipient.getSender(), recipient.address, mintAmount, {
            value: payAmount + toNano('0.1'),
            returnExcess: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: recipient.address,
            to: jettonMinter.address,
            success: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            to: recipient.address,
            success: true,
            op: JETTON_EXCESSES_OPCODE,
        });

        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(mintAmount);
    });

    it('should mint tokens correctly by random wallet (via raw send)', async () => {
        const recipient = await blockchain.treasury('random');
        const mintAmount = toNano('100');
        const fee = mintFee;
        const payAmount = (mintAmount * defaultConfig.mintExchangeRate) / 1000000000n;

        const preparation = prepareMint(
            recipient.getSender(),
            jettonMinter.address,
            recipient.address,
            mintAmount,
            {
                returnExcess: true,
            },
            fee,
            defaultConfig.mintExchangeRate,
        );

        expect(preparation.value).toBe(payAmount + fee);

        const mintResult = await recipient.sendMessages([
            internal({
                to: preparation.sendToAddress,
                value: preparation.value!,
                body: preparation.payload,
            }),
        ]);

        expect(mintResult.transactions).toHaveTransaction({
            from: recipient.address,
            to: jettonMinter.address,
            success: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            to: recipient.address,
            success: true,
            op: JETTON_EXCESSES_OPCODE,
        });

        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(mintAmount);
    });

    it('should mint tokens incorrectly (missing compute_fee)', async () => {
        const recipient = await blockchain.treasury('random');
        const mintAmount = toNano('100');
        const payAmount = (mintAmount * defaultConfig.mintExchangeRate) / 1000000000n;

        const mintResult = await jettonMinter.sendMint(recipient.getSender(), recipient.address, mintAmount, {
            value: payAmount + toNano('0.002'), // only got fwd_fee, missing compute_fee
            returnExcess: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: recipient.address,
            to: jettonMinter.address,
            success: false,
            exitCode: 77,
        });

        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(0n);
    });

    it('should mint tokens incorrectly (missing fwd_fee and compute_fee)', async () => {
        const recipient = await blockchain.treasury('recipient');
        const mintAmount = toNano('100');
        const payAmount = (mintAmount * defaultConfig.mintExchangeRate) / 1000000000n;

        const mintResult = await jettonMinter.sendMint(deployer.getSender(), recipient.address, mintAmount, {
            value: payAmount, // missing fwd_fee + compute_fee
            returnExcess: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: false,
            exitCode: 77,
        });

        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(0n);
    });

    it('should burn tokens correctly', async () => {
        // mint first
        const recipient = await blockchain.treasury('recipient');
        let mintAmount = toNano('100');
        const payAmount = (mintAmount * defaultConfig.mintExchangeRate) / 1000000000n;

        const mintResult = await jettonMinter.sendMint(deployer.getSender(), recipient.address, mintAmount, {
            value: payAmount + mintFee,
            returnExcess: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        const data1 = await jettonMinter.getData();
        expect(data1.totalSupply).toBe(mintAmount);

        // start step burning
        for (let i = 0; i < 100; i++) {
            // burn 1 at once (to check if we drain the wallet properly)
            const burnAmount = toNano('1');
            const jettonWallet = blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(recipient.address)),
            );
            const burnResults = await jettonWallet.sendBurn(recipient.getSender(), burnAmount, {
                value: burnFee,
                returnExcess: true,
            });

            expect(burnResults.transactions).toHaveTransaction({
                from: recipient.address,
                to: jettonWallet.address,
                success: true,
                op: JETTON_BURN_OPCODE,
            });
            expect(burnResults.transactions).toHaveTransaction({
                from: jettonWallet.address,
                to: jettonMinter.address,
                success: true,
                op: JETTON_BURN_NOTIFICATION_OPCODE,
            });

            expect(burnResults.transactions).toHaveTransaction({
                from: jettonMinter.address,
                to: recipient.address,
                success: true,
                op: JETTON_BURN_REDEEM_OPCODE,
                value: (x: bigint | undefined) =>
                    (x ?? 0n) >= (burnAmount * defaultConfig.burnExchangeRate) / 1000000000n,
            });

            mintAmount -= burnAmount;
            const data2 = await jettonMinter.getData();
            expect(data2.totalSupply).toBe(mintAmount);
        }
    });

    it('should burn tokens incorrectly (value not enough)', async () => {
        // mint first
        const recipient = await blockchain.treasury('recipient');
        let mintAmount = toNano('100');
        const payAmount = (mintAmount * defaultConfig.mintExchangeRate) / 1000000000n;

        const mintResult = await jettonMinter.sendMint(deployer.getSender(), recipient.address, mintAmount, {
            value: payAmount + toNano('1'),
            returnExcess: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        let data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(mintAmount);

        // burn token
        const burnAmount = toNano('1');
        const jettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(recipient.address)),
        );
        const burnResults = await jettonWallet.sendBurn(recipient.getSender(), burnAmount, {
            value: toNano('0.005'), // not enough burn fee
            returnExcess: true,
        });

        expect(burnResults.transactions).toHaveTransaction({
            from: recipient.address,
            to: jettonWallet.address,
            success: false,
            op: JETTON_BURN_OPCODE,
        });

        data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(mintAmount);
    });

    it('should change admin correctly', async () => {
        const newAdmin = await blockchain.treasury('newAdmin');

        const changeAdminResult = await jettonMinter.sendChangeAdmin(deployer.getSender(), newAdmin.address, {
            value: adminOperationFee,
        });

        expect(changeAdminResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        const data = await jettonMinter.getData();
        expect(data.adminAddress?.toString()).toBe(newAdmin.address.toString());
    });

    it('should change exchange rates correctly (including mint/burn sanity check)', async () => {
        const changeExchangeRatesResult = await jettonMinter.sendChangeExchangeRates(
            deployer.getSender(),
            3333333333n,
            333333333n,
            {
                value: adminOperationFee,
            },
        );

        expect(changeExchangeRatesResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
            outMessagesCount: 0,
        });

        const { mintExchangeRate, burnExchangeRate } = await jettonMinter.getExchangeRates();
        expect(mintExchangeRate).toBe(3333333333n);
        expect(burnExchangeRate).toBe(333333333n);

        // mint tokens
        const recipient = await blockchain.treasury('random');
        const mintAmount = toNano('100');
        const payAmount = (mintAmount * mintExchangeRate) / 1000000000n;

        const mintResult = await jettonMinter.sendMint(recipient.getSender(), recipient.address, mintAmount, {
            value: payAmount + toNano('0.1'),
            returnExcess: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: recipient.address,
            to: jettonMinter.address,
            success: true,
        });

        expect(mintResult.transactions).toHaveTransaction({
            to: recipient.address,
            success: true,
            op: JETTON_EXCESSES_OPCODE,
        });

        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(mintAmount);

        // burn tokens
        const burnAmount = toNano('75');
        const jettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(recipient.address)),
        );
        const burnResults = await jettonWallet.sendBurn(recipient.getSender(), burnAmount, {
            value: burnFee,
            returnExcess: true,
        });

        expect(burnResults.transactions).toHaveTransaction({
            from: recipient.address,
            to: jettonWallet.address,
            success: true,
            op: JETTON_BURN_OPCODE,
        });
        expect(burnResults.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: jettonMinter.address,
            success: true,
            op: JETTON_BURN_NOTIFICATION_OPCODE,
        });

        expect(burnResults.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: recipient.address,
            success: true,
            op: JETTON_BURN_REDEEM_OPCODE,
            value: (x: bigint | undefined) => (x ?? 0n) >= (burnAmount * burnExchangeRate) / 1000000000n,
        });

        const data2 = await jettonMinter.getData();
        expect(data2.totalSupply).toBe(mintAmount - burnAmount);
    });

    it('should change content correctly', async () => {
        const newContent = beginCell().storeUint(1, 8).storeStringTail('new content').endCell();

        const changeContentResult = await jettonMinter.sendChangeContent(deployer.getSender(), newContent, {
            value: adminOperationFee,
        });

        expect(changeContentResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        const data = await jettonMinter.getData();
        expect(data.jettonContent.toBoc().toString('hex')).toBe(newContent.toBoc().toString('hex'));
    });

    it('should get wallet address correctly', async () => {
        const owner = await blockchain.treasury('owner');
        const walletAddress = await jettonMinter.getWalletAddress(owner.address);

        expect(walletAddress).toBeDefined();
        expect(walletAddress).toBeInstanceOf(Address);
    });

    it('should get wallet address onchain correctly', async () => {
        const owner = await blockchain.treasury('owner');
        const provideWalletAddressResult = await jettonMinter.sendProvideWalletAddress(
            deployer.getSender(),
            owner.address,
        );

        expect(provideWalletAddressResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
            op: JETTON_PROVIDE_WALLET_ADDRESS,
        });

        expect(provideWalletAddressResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: deployer.address,
            success: true,
            op: JETTON_TAKE_WALLET_ADDRESS,
        });
    });

    it('should withdraw all correctly', async () => {
        const deployerOldBalance = await deployer.getBalance();

        const withdrawResult = await jettonMinter.sendWithdrawAll(deployer.getSender());

        expect(withdrawResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        expect(withdrawResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: deployer.address,
            success: true,
        });

        const deployerNewBalance = await deployer.getBalance();
        const contractNewBalance = await jettonMinter.getBalance();

        expect(deployerNewBalance).toBeGreaterThan(deployerOldBalance);
        expect(contractNewBalance).toBe(0n);
    });

    it('should not drain our funds', async () => {
        const attacker = await blockchain.treasury('attacker', { balance: toNano('1000') });
        const attackerBalanceBefore = await attacker.getBalance();
        const fundBalanceBefore = await jettonMinter.getBalance();

        for (let i = 0; i < 500; i++) {
            await attacker.sendMessages([
                internal({
                    to: jettonMinter.address,
                    value: 1n,
                    body: beginCell().storeUint(87878, 32).storeUint(87878, 64).endCell(),
                }),
            ]);
        }

        const fundBalanceAfter = await jettonMinter.getBalance();
        const attackerBalanceAfter = await attacker.getBalance();

        const attackerBalanceDiff = attackerBalanceBefore - attackerBalanceAfter;
        const fundBalanceDiff = fundBalanceBefore - fundBalanceAfter;

        expect(attackerBalanceDiff).toBeGreaterThan(fundBalanceDiff);
    });
});
