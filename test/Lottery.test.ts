import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
    Lottery,
    Lottery__factory,
} from "../typechain-types";
import { reset } from "@nomicfoundation/hardhat-toolbox/network-helpers"

async function getBlockTimestamp(tx: any): Promise<number> {
    const minedTx = await tx.wait();
    const txBlock = await ethers.provider.getBlock(minedTx.blockNumber);
    return txBlock?.timestamp || 0;
}

describe('Lottery contract', () => {
    let lottery: any;
    let admin: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    let addr2: HardhatEthersSigner;
    let addr3: HardhatEthersSigner;
    let feeReciever: HardhatEthersSigner;
    const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
    const vrfCoordinatorV2Plus = '0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B';
    const subscriptionId = '1';

    before(async () => {
        await reset();
    });

    beforeEach(async () => {
        [admin, addr1, addr2, addr3, feeReciever] = await ethers.getSigners();
        const Lottery = (await ethers.getContractFactory('Lottery')) as Lottery__factory;
        lottery = await Lottery.deploy(subscriptionId, feeReciever.address, vrfCoordinatorV2Plus, keyHash);
    });

    describe('Deployment', async () => {
        it('should successfully deploy the contract with valid constructor parameters', async () => {
            /* ASSERT */
            expect(await lottery.feeReceiver()).to.equal(feeReciever.address);
            expect(await lottery.owner()).to.equal(admin.address);
        });
    });

    describe('createLottery', () => {
        it('should revert if maxTickets is zero', async () => {
            /* EXECUTE */
            const promise = lottery.connect(admin).createLottery(100, 10, 0, ethers.parseEther('1'));

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'TicketsAreZero');
        });

        it('should revert if fees is zero', async () => {
            /* EXECUTE */
            const promise = lottery.connect(admin).createLottery(100, 0, 10, ethers.parseEther('1'));

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'FeeIsZero');
        });

        it('should revert if duration is zero', async () => {
            /* EXECUTE */
            const promise = lottery.connect(admin).createLottery(0, 10, 10, ethers.parseEther('1'));

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'DurationIsZero');
        });

        it('should revert if ticket price is zero', async () => {
            /* EXECUTE */
            const promise = lottery.connect(admin).createLottery(100, 10, 10, 0);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'TicketPriceIsZero');
        });

        it('should revert if the caller is not the admin', async () => {
            /* EXECUTE */
            const promise = lottery.connect(addr1).createLottery(100, 10, 10, ethers.parseEther('1'));

            /* ASSERT */
            await expect(promise).to.be.revertedWith('Only callable by owner');
        });

        it('should create a new lottery with valid parameters', async () => {
            /* EXECUTE */
            const tx = await lottery.connect(admin).createLottery(100, 10, 10, ethers.parseEther('1'));

            /* ASSERT */
            const startAt = await getBlockTimestamp(tx);
            const lotteryInfo = await lottery.lottery(0);

            expect(lotteryInfo.maxTickets).to.equal(10);
            expect(lotteryInfo.fees).to.equal(10);
            expect(lotteryInfo.endAt).to.equal(startAt + 100);
            expect(await lottery.lotteryCount()).to.equal(1);

            await expect(tx)
                .to.emit(lottery, 'LotteryCreated')
                .withArgs(10, 10, startAt + 100, ethers.parseEther('1'));
        });
    });

    describe('sets feeReceiver wallet', async () => {
        it('sets feeReceiver wallet successfully', async () => {
            /* SETUP */
            const feeReceiverBefore = await lottery.feeReceiver();

            /* EXECUTE */
            await lottery.connect(admin).setFeeReceiver(addr2.address);

            /* ASSERT */
            const feeReceiverAfter = await lottery.feeReceiver();

            expect(feeReceiverAfter).to.not.equal(feeReceiverBefore);
            expect(feeReceiverAfter).to.equal(addr2.address);
        });

        it('rejects setting while zero address', async () => {
            /* EXECUTE */
            const promise = lottery.connect(admin).setFeeReceiver(ethers.ZeroAddress);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'ZeroAddress');
        });

        it('rejects if not default admin role', async () => {
            /* EXECUTE */
            const promise = lottery.connect(addr1).setFeeReceiver(addr2.address);

            /* ASSERT */
            await expect(promise).to.be.revertedWith('Only callable by owner');
        });
    });

    describe('buyTickets', () => {
        it('should revert if tickets is zero', async () => {
            /* EXECUTE */
            const promise = lottery.connect(addr1).buyTickets(0, 0);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'TicketsAreZero');
        });

        it('should revert if msg.value is not equal to tickets', async () => {
            /* EXECUTE */
            const promise = lottery.connect(addr1).buyTickets(0, 1, { value: ethers.parseEther('0.5') });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'AmountLessThanTickets');
        });

        it('should revert if tickets is greater than maxTickets of the lottery', async () => {
            /* SETUP */
            await lottery.connect(admin).createLottery(100, 10, 10, ethers.parseEther('1'));

            /* EXECUTE */
            const promise = lottery.buyTickets(0, 11, { value: ethers.parseEther('11') });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'MaxTicketsExceeded');
        });

        it('should revert if the lottery has ended', async () => {
            /* SETUP */
            await lottery.connect(admin).createLottery(1, 10, 10, ethers.parseEther('1'));
            await ethers.provider.send('evm_increaseTime', [2]);
            await ethers.provider.send('evm_mine', []);

            /* EXECUTE */
            const promise = lottery.buyTickets(0, 1, { value: ethers.parseEther('1') });

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'LotteryEnded');
        });

        it('should buy tickets for a lottery with valid parameters', async () => {
            /* SETUP */
            await lottery.connect(admin).createLottery(100, 10, 10, ethers.parseEther('1'));

            const adminBalanceBefore = await ethers.provider.getBalance(admin.address);
            const contractBalanceBefore = await ethers.provider.getBalance(lottery.target);

            /* EXECUTE */
            const tx = await lottery.buyTickets(0, 1, { value: ethers.parseEther('1') });

            /* ASSERT */
            const minedTx = await tx.wait();
            const fee: bigint = BigInt(minedTx!.gasUsed * minedTx!.gasPrice);

            const adminBalanceAfter = await ethers.provider.getBalance(admin.address);
            const contractBalanceAfter = await ethers.provider.getBalance(lottery.target);

            expect(adminBalanceAfter).to.equal(adminBalanceBefore - ethers.parseEther('1') - fee);
            expect(contractBalanceAfter).to.equal(contractBalanceBefore + ethers.parseEther('1'));
            expect((await lottery.getTickets(0)).length).to.equal(1);
            await expect(tx)
                .to.emit(lottery, 'Bought')
                .withArgs(admin.address, 0, 1);
        });

        it('should buy multiple tickets for a lottery with valid parameters', async () => {
            /* SETUP */
            await lottery.connect(admin).createLottery(100, 10, 10, ethers.parseEther('1'));

            const adminBalanceBefore = await ethers.provider.getBalance(admin.address);
            const contractBalanceBefore = await ethers.provider.getBalance(lottery.target);

            /* EXECUTE */
            const tx = await lottery.buyTickets(0, 3, { value: ethers.parseEther('3') });

            /* ASSERT */
            const minedTx = await tx.wait();
            const fee: bigint = BigInt(minedTx!.gasUsed * minedTx!.gasPrice);

            const adminBalanceAfter = await ethers.provider.getBalance(admin.address);
            const contractBalanceAfter = await ethers.provider.getBalance(lottery.target);

            expect(adminBalanceAfter).to.equal(adminBalanceBefore - ethers.parseEther('3') - fee);
            expect(contractBalanceAfter).to.equal(contractBalanceBefore + ethers.parseEther('3'));
            expect((await lottery.getTickets(0)).length).to.equal(3);
            await expect(tx)
                .to.emit(lottery, 'Bought')
                .withArgs(admin.address, 0, 3);
        });

    });

    describe('win', () => {
        it('should revert if the lottery has not ended', async () => {
            /* SETUP */
            await lottery.connect(admin).createLottery(100, 10, 10, ethers.parseEther('1'));

            /* EXECUTE */
            const promise = lottery.connect(addr1).win(0);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(lottery, 'LotteryNotEnded');
        });
    });
});  