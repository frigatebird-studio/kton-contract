import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('JettonMinter', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('JettonMinter');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;

    const defaultContent = beginCell().storeUint(0, 8).endCell();
    const walletCode = beginCell().storeUint(0, 8).endCell();

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    admin: deployer.address,
                    content: defaultContent,
                    jettonWalletCode: walletCode,
                },
                code,
            ),
        );

        const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy and initialize with correct data', async () => {
        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(0n);
        expect(data.mintable).toBe(true);
        expect(data.adminAddress?.toString()).toBe(deployer.address.toString());
    });

    it('should mint tokens correctly', async () => {
        const recipient = await blockchain.treasury('recipient');
        const mintAmount = toNano('100');

        const mintResult = await jettonMinter.sendMint(deployer.getSender(), recipient.address, mintAmount, {
            value: toNano('0.1'),
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        const data = await jettonMinter.getData();
        expect(data.totalSupply).toBe(mintAmount);
    });

    it('should change admin correctly', async () => {
        const newAdmin = await blockchain.treasury('newAdmin');

        const changeAdminResult = await jettonMinter.sendChangeAdmin(deployer.getSender(), newAdmin.address, {
            value: toNano('0.05'),
        });

        expect(changeAdminResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        const data = await jettonMinter.getData();
        expect(data.adminAddress?.toString()).toBe(newAdmin.address.toString());
    });

    it('should change content correctly', async () => {
        const newContent = beginCell().storeUint(1, 8).endCell();

        const changeContentResult = await jettonMinter.sendChangeContent(deployer.getSender(), newContent, {
            value: toNano('0.05'),
        });

        expect(changeContentResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });
    });

    it('should get wallet address correctly', async () => {
        const owner = await blockchain.treasury('owner');
        const walletAddress = await jettonMinter.getWalletAddress(owner.address);

        expect(walletAddress).toBeDefined();
        expect(walletAddress).toBeInstanceOf(Address);
    });
});
