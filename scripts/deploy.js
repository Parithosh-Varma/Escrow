const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer, treasury] = await hre.ethers.getSigners();
  
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const defaultFeePercent = 100n; // 1%
  const treasuryAddress = process.env.TREASURY || deployer.address;

  const DecentralizedEscrow = await hre.ethers.getContractFactory("DecentralizedEscrow");
  const escrow = await DecentralizedEscrow.deploy(deployer.address, treasuryAddress, defaultFeePercent);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("DecentralizedEscrow deployed to:", escrowAddress);

  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  console.log("MockUSDC deployed to:", await usdc.getAddress());

  const deploymentInfo = {
    network: hre.network.name,
    escrow: escrowAddress,
    usdc: await usdc.getAddress(),
    admin: deployer.address,
    treasury: treasuryAddress,
    defaultFeePercent: defaultFeePercent.toString(),
    timestamp: new Date().toISOString(),
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filePath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info saved to:", filePath);

  await hre.run("verify:verify", {
    address: escrowAddress,
    constructorArguments: [deployer.address, treasuryAddress, defaultFeePercent],
  }).catch(() => console.log("Verification skipped or failed"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
