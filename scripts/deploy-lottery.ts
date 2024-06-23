import hre, { ethers } from "hardhat";
import { Lottery__factory } from "../typechain-types/factories/contracts/Lottery__factory";
import { Lottery } from "../typechain-types/contracts/Lottery";

async function main() {
  let lottery: Lottery;

  const feeReciever = process.env.FEE_RECIEVER || '';
  const subscriptionId = process.env.SUBSCRIPTION_ID || '';
  const vrfCoordinatorAddress = process.env.VRF_COORDINATOR_ADDRESS || '';
  const keyHash = process.env.KEY_HASH || '';

  const Lottery = (await ethers.getContractFactory('Lottery')) as Lottery__factory;
  lottery = await Lottery.deploy(subscriptionId, feeReciever, vrfCoordinatorAddress, keyHash);

  await lottery.waitForDeployment();

  console.log("Lottery deployed to:", lottery.target);

  await lottery.deploymentTransaction()?.wait(5)

  await hre.run("verify:verify", {
    address: lottery.target,
    constructorArguments: [subscriptionId, feeReciever, vrfCoordinatorAddress, keyHash],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
