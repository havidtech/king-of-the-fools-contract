const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const {
  parseEther,
  parseUnits,
  defaultAbiCoder,
  hexlify,
  randomBytes,
} = require("ethers/lib/utils");
const { BigNumber } = require("ethers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

async function main() {
  const balance = parseUnits("400000000000000000000", 6); // just use a large number
  const USDC_TOKEN_SLOT = 9;
  const index = ethers.utils.hexStripZeros(
    ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      ["0x39be2dFe9304dAcB44d9a58E901e225BE26d2067", USDC_TOKEN_SLOT] // key, slot
    )
  );
  await ethers.provider.send("hardhat_setStorageAt", [
    "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
    index.toString(),
    ethers.utils.defaultAbiCoder.encode(["uint256"], [balance]), // $10
  ]);

  // await ethers.provider.send("hardhat_setBalance", [
  //   "0xFaA33987B5b21B089C2bb1ce8910aEc691672604",
  //   ethers.utils.hexStripZeros(parseEther("10000").toHexString()),
  // ]);

  // const kingOfTheFools = await ethers.getContractAt(
  //   "KingOfTheFools",
  //   "0xa22B867E583A263bD22fb5825363B73d368fEEB1"
  // );

  // // transferOwnership.
  // const transferOwnershipTx = await kingOfTheFools.transferOwnership(
  //   "0x39be2dFe9304dAcB44d9a58E901e225BE26d2067");
  // await transferOwnershipTx.wait();
}

main();
