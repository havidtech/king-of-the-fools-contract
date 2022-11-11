const { ethers, upgrades } = require("hardhat");

const localChainId = "31337";

module.exports = async ({ getChainId }) => {
  const chainId = await getChainId();

  const KingOfTheFools = await ethers.getContractFactory("KingOfTheFools");
  const kingOfTheFoolsProxy = await upgrades.deployProxy(KingOfTheFools);
  await kingOfTheFoolsProxy.deployed();

  const kingOfTheFoolsProxyAddress = kingOfTheFoolsProxy.address;
  const kingOfTheFoolsImplementationAddress =
    upgrades.erc1967.getImplementationAddress(kingOfTheFoolsProxyAddress);
  const kingOfTheFoolsAdminAddress = upgrades.erc1967.getAdminAddress(
    kingOfTheFoolsProxyAddress
  );

  console.log(kingOfTheFoolsProxyAddress, " kingOfTheFools(proxy) address");
  console.log(
    await kingOfTheFoolsImplementationAddress,
    " getImplementationAddress"
  );
  console.log(await kingOfTheFoolsAdminAddress, " getAdminAddress");

  // verify on etherscan
  try {
    if (chainId !== localChainId) {
      await run("verify:verify", {
        address: kingOfTheFoolsProxyAddress,
      });
    }
  } catch (error) {
    console.error(error);
  }
};
module.exports.tags = ["KingOfTheFools"];
