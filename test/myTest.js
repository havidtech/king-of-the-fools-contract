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

function nextHighestDepoosit(prevHighestDeposit) {
  const prev = BigNumber.from(prevHighestDeposit);
  if (!prev.mod(2).eq(0))
    throw new Error("Please use deposits that are multiples of 2");
  const halfOfPrev = prev.div(2);
  return prev.add(halfOfPrev);
}

async function getDataForReceiveWithPermit(wallet, token, to, value) {
  const [nonce, name, version, chainId] = await Promise.all([
    hexlify(randomBytes(32)),
    "USD Coin",
    "2",
    5, // ChainId for Goerli testnet
  ]);

  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for an hour
  const { v, r, s } = ethers.utils.splitSignature(
    // eslint-disable-next-line no-underscore-dangle
    await wallet._signTypedData(
      {
        name,
        version,
        chainId,
        verifyingContract: token.address,
      },
      {
        ReceiveWithAuthorization: [
          {
            name: "from",
            type: "address",
          },
          {
            name: "to",
            type: "address",
          },
          {
            name: "value",
            type: "uint256",
          },
          {
            name: "validAfter",
            type: "uint256",
          },
          {
            name: "validBefore",
            type: "uint256",
          },
          {
            name: "nonce",
            type: "bytes32",
          },
        ],
      },
      {
        from: wallet.address,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      }
    )
  );

  return defaultAbiCoder.encode(
    [
      "address",
      "address",
      "uint",
      "uint",
      "uint",
      "bytes32",
      "uint8",
      "bytes32",
      "bytes32",
    ],
    [wallet.address, to, value, validAfter, validBefore, nonce, v, r, s]
  );
}

describe("King of The Fools", function () {
  // quick fix to let gas reporter fetch data from gas station & coinmarketcap
  before((done) => {
    setTimeout(done, 2000);
  });

  describe("KingOfTheFools (proxy)", function () {
    const CURRENCY_ETH = 0;
    const CURRENCY_USDC = 1;
    const USDC_ADDRESS = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F"; // Ethereum Goerli
    const CHAINLINK_AGGREGATOR_PROXY_ADDRESS =
      "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e"; // Ethereum Goerli
    const CHAINLINK_USD_MULTIPLIER = parseUnits("1", 8);

    const WEI_PER_ETHER = parseEther("1");
    const USD_PER_WEI = BigNumber.from(2);
    const MOCK_USD_PER_ETH = USD_PER_WEI.mul(WEI_PER_ETHER).mul(
      CHAINLINK_USD_MULTIPLIER
    );

    const USDC_DEPOSIT = USD_PER_WEI.mul(parseUnits("2", 6)); // Let it be a multiple to avoid any truncation
    const HIGHER_USDC_DEPOSIT = nextHighestDepoosit(USDC_DEPOSIT);
    const INSUFFICIENT_USDC_DEPOSIT = HIGHER_USDC_DEPOSIT.sub(1);

    const ETH_DEPOSIT = parseEther("0.0000000000000001");
    const HIGHER_ETH_DEPOSIT = nextHighestDepoosit(ETH_DEPOSIT);
    const INSUFFICIENT_ETH_DEPOSIT = HIGHER_ETH_DEPOSIT.sub(1);

    const USDC_MULTIPLIER = parseUnits("1", 6);

    const HIGHER_USDC_DEPOSIT_AFTER_ETH_DEPOSIT = nextHighestDepoosit(
      ETH_DEPOSIT.mul(USD_PER_WEI).mul(USDC_MULTIPLIER)
    );
    const INSUFFICIENT_USDC_DEPOSIT_AFTER_ETH_DEPOSIT =
      HIGHER_USDC_DEPOSIT_AFTER_ETH_DEPOSIT.sub(1);

    const HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT = nextHighestDepoosit(
      USDC_DEPOSIT.div(USDC_MULTIPLIER).div(USD_PER_WEI)
    );
    const INSUFFICIENT_ETH_DEPOSIT_AFTER_USDC_DEPOSIT =
      HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT.sub(1);

    let USDC_CONTRACT;

    let kingOfTheFools;
    let ownerAddress;
    let user1Address;
    let user1;
    let user2Address;
    let user2;
    let owner;
    let setUSDCBalance;

    before(async function () {
      [owner, user1, user2] = await ethers.getSigners(3);
      ownerAddress = await owner.getAddress();
      user1Address = await user1.getAddress();
      user2Address = await user2.getAddress();
      USDC_CONTRACT = await ethers.getContractAt(
        "IERC20Upgradeable",
        USDC_ADDRESS
      );

      setUSDCBalance = async (address, user) => {
        const balance = parseUnits("10000000", 6); // just use a large number
        const USDC_TOKEN_SLOT = 9;
        const index = ethers.utils.hexStripZeros(
          ethers.utils.solidityKeccak256(
            ["uint256", "uint256"],
            [address, USDC_TOKEN_SLOT] // key, slot
          )
        );
        await ethers.provider.send("hardhat_setStorageAt", [
          USDC_ADDRESS,
          index.toString(),
          ethers.utils.defaultAbiCoder.encode(["uint256"], [balance]), // $10
        ]);

        // Approve Proxy to spend.
        const approveTx = await USDC_CONTRACT.connect(user).approve(
          kingOfTheFools.address,
          balance
        );
        await approveTx.wait();
      };

      // Set Storage of Chainlink AggregatorProxy to a Mocked version
      const mockAggregatorProxyFactory = await ethers.getContractFactory(
        "MockAggregatorProxy"
      );
      const mockAggregator = await mockAggregatorProxyFactory.deploy(
        MOCK_USD_PER_ETH
      );

      await mockAggregator.deployed();
      const code = await ethers.provider.send("eth_getCode", [
        mockAggregator.address,
      ]);
      await ethers.provider.send("hardhat_setCode", [
        CHAINLINK_AGGREGATOR_PROXY_ADDRESS,
        code,
      ]);
    });

    beforeEach(async function () {
      const KingOfTheFools = await ethers.getContractFactory("KingOfTheFools");
      kingOfTheFools = await upgrades.deployProxy(KingOfTheFools, {
        initializer: "initialize",
      });
      await kingOfTheFools.connect(user1).deployed();

      // Set USDC Balance of users.
      await setUSDCBalance(user1Address, user1);
      await setUSDCBalance(user2Address, user2);
      await setUSDCBalance(ownerAddress, owner);
    });

    it("should set proxy as king of the fools on deployment", async function () {
      expect(await kingOfTheFools.kingOfTheFools()).to.equal(
        kingOfTheFools.address
      );
    });

    it("should fail if the King of the fools participates", async function () {
      // USDC Deposit
      await kingOfTheFools
        .connect(user1)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);

      await expect(
        kingOfTheFools
          .connect(user1)
          .depositUSDCWithoutPermit(HIGHER_USDC_DEPOSIT)
      ).to.be.revertedWithCustomError(
        kingOfTheFools,
        "CurrentKingCannotParticipate"
      );
    });

    it("should not allow deposit of 0", async function () {
      // For Eth
      await expect(
        kingOfTheFools.connect(user1).depositETH()
      ).to.be.revertedWithCustomError(kingOfTheFools, "InsufficientDeposit");

      // For USDC
      await expect(
        kingOfTheFools.connect(user2).depositUSDCWithoutPermit(0)
      ).to.be.revertedWithCustomError(kingOfTheFools, "InsufficientDeposit");
    });

    it("should deposit funds to the contract and not sent out in the same transaction", async function () {
      // USDC Deposit
      await kingOfTheFools
        .connect(user2)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);
      // Eth Deposit
      await kingOfTheFools.connect(user1).depositETH({
        value: HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT,
      });

      expect(
        await ethers.provider.getBalance(kingOfTheFools.address)
      ).to.be.equals(HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT);
      expect(
        await USDC_CONTRACT.balanceOf(kingOfTheFools.address)
      ).to.be.equals(USDC_DEPOSIT);
    });

    it("should accept ETH deposit if atleast 1.5 greater than highest deposit when currency of highest deposit is Eth", async function () {
      // ETH Deposit
      await kingOfTheFools.connect(user2).depositETH({ value: ETH_DEPOSIT });

      await expect(
        kingOfTheFools.connect(user1).depositETH({
          value: HIGHER_ETH_DEPOSIT,
        })
      ).to.not.reverted;
    });

    it("should accept USDC deposit if atleast 1.5 greater than highest deposit when currency of highest deposit is USDC", async function () {
      // USDC Deposit
      await kingOfTheFools
        .connect(user2)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);

      await expect(
        kingOfTheFools
          .connect(user1)
          .depositUSDCWithoutPermit(HIGHER_USDC_DEPOSIT)
      ).to.not.reverted;
    });

    it("should fail if ETH deposited is insufficient when previous deposit was USDC", async function () {
      // Valid Deposit of USDC
      await kingOfTheFools
        .connect(user2)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);

      // lower deposit in ETH
      await expect(
        kingOfTheFools.connect(user1).depositETH({
          value: INSUFFICIENT_ETH_DEPOSIT_AFTER_USDC_DEPOSIT,
        })
      ).to.be.revertedWithCustomError(kingOfTheFools, "InsufficientDeposit");
    });

    it("should fail if USDC deposited is insufficient when previous deposit was ETH", async function () {
      // valid ETH Deposit
      await kingOfTheFools.connect(user1).depositETH({ value: ETH_DEPOSIT });

      // lower deposit in USDC
      await expect(
        kingOfTheFools
          .connect(user2)
          .depositUSDCWithoutPermit(INSUFFICIENT_USDC_DEPOSIT_AFTER_ETH_DEPOSIT)
      ).to.be.revertedWithCustomError(kingOfTheFools, "InsufficientDeposit");
    });

    it("should fail if for same currency(ETH) new deposit is not >=1.5 of highestDeposit", async function () {
      await kingOfTheFools.connect(user1).depositETH({ value: ETH_DEPOSIT });
      await expect(
        kingOfTheFools.connect(user2).depositETH({
          value: INSUFFICIENT_ETH_DEPOSIT,
        })
      ).to.be.revertedWithCustomError(kingOfTheFools, "InsufficientDeposit");
    });

    it("should fail if for same currency(USDC) new deposit is not >=1.5 of highestDeposit", async function () {
      await kingOfTheFools
        .connect(user2)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);
      await expect(
        kingOfTheFools
          .connect(user1)
          .depositUSDCWithoutPermit(INSUFFICIENT_USDC_DEPOSIT)
      ).to.be.revertedWithCustomError(kingOfTheFools, "InsufficientDeposit");
    });

    it("should allow a past king of fools to claim ETH reward", async function () {
      // Deposits
      await kingOfTheFools.connect(user1).depositETH({ value: ETH_DEPOSIT });
      await kingOfTheFools.connect(user2).depositETH({
        value: HIGHER_ETH_DEPOSIT,
      });

      const myClaim = await kingOfTheFools.pendingClaims(user1Address);
      expect(myClaim[0].eq(0)).to.equals(true);
      expect(myClaim[1].eq(HIGHER_ETH_DEPOSIT)).to.equals(true);

      await kingOfTheFools.connect(user1).withdrawClaim();
      const myClaimAfterWithdraw = await kingOfTheFools.pendingClaims(
        user1Address
      );
      expect(myClaimAfterWithdraw[0].eq(0)).to.equals(true);
      expect(myClaimAfterWithdraw[1].eq(0)).to.equals(true);
      expect(
        await ethers.provider.getBalance(kingOfTheFools.address)
      ).to.be.equals(ETH_DEPOSIT);
    });

    it("should allow a past king of fools to claim USDC reward", async function () {
      // Deposits
      await kingOfTheFools
        .connect(user2)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);
      await kingOfTheFools
        .connect(user1)
        .depositUSDCWithoutPermit(HIGHER_USDC_DEPOSIT);

      const myClaim = await kingOfTheFools.pendingClaims(user2Address);
      expect(myClaim[0].eq(HIGHER_USDC_DEPOSIT)).to.equals(true);
      expect(myClaim[1].eq(0)).to.equals(true);

      await kingOfTheFools.connect(user2).withdrawClaim();
      const myClaimAfterWithdraw = await kingOfTheFools.pendingClaims(
        user2Address
      );
      expect(myClaimAfterWithdraw[0].eq(0)).to.equals(true);
      expect(myClaimAfterWithdraw[1].eq(0)).to.equals(true);
      expect(
        await USDC_CONTRACT.balanceOf(kingOfTheFools.address)
      ).to.be.equals(USDC_DEPOSIT);
    });

    it("should fail if there is nothing to claim", async function () {
      await expect(
        kingOfTheFools.connect(user2).withdrawClaim()
      ).to.be.revertedWithCustomError(kingOfTheFools, "NothingToClaim");
    });

    it("should allow owner to withdraw constracts claim", async function () {
      // First Deposit
      await kingOfTheFools.connect(user1).depositETH({ value: ETH_DEPOSIT });
      const contractsClaimBeforeWithdrawal = await kingOfTheFools.pendingClaims(
        kingOfTheFools.address
      );

      expect(contractsClaimBeforeWithdrawal[0].eq(0)).to.equals(true);
      expect(contractsClaimBeforeWithdrawal[1].eq(ETH_DEPOSIT)).to.equals(true);

      await kingOfTheFools.withdrawContractsClaim();
      const contractsClaimAfterWithdrawal = await kingOfTheFools.pendingClaims(
        kingOfTheFools.address
      );
      expect(contractsClaimAfterWithdrawal[0].eq(0)).to.equals(true);
      expect(contractsClaimAfterWithdrawal[1].eq(0)).to.equals(true);
    });

    it("should not allow non owner to withdraw constracts claim", async function () {
      // First Deposit
      await kingOfTheFools.connect(user1).depositETH({ value: ETH_DEPOSIT });
      const contractsClaimBeforeWithdrawal = await kingOfTheFools.pendingClaims(
        kingOfTheFools.address
      );

      expect(contractsClaimBeforeWithdrawal[0].eq(0)).to.equals(true);
      expect(contractsClaimBeforeWithdrawal[1].eq(ETH_DEPOSIT)).to.equals(true);

      await expect(kingOfTheFools.connect(user2).withdrawContractsClaim()).to.be
        .reverted;
    });

    it("should emit NewKingOfTheFools events", async function () {
      // USDC Deposit
      await expect(
        kingOfTheFools.connect(user1).depositUSDCWithoutPermit(USDC_DEPOSIT)
      )
        .to.emit(kingOfTheFools, "NewKingOfTheFools")
        .withArgs(user1Address, USDC_DEPOSIT, CURRENCY_USDC, anyValue);

      // Eth Deposit
      await expect(
        kingOfTheFools.connect(user2).depositETH({
          value: HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT,
        })
      )
        .to.emit(kingOfTheFools, "NewKingOfTheFools")
        .withArgs(
          user2Address,
          HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT,
          CURRENCY_ETH,
          anyValue
        );
    });

    it("should allow depositing USDC with permit", async function () {
      // User1 Deposits
      const receiveAuthorizationForUser1 = await getDataForReceiveWithPermit(
        user1,
        USDC_CONTRACT,
        kingOfTheFools.address,
        USDC_DEPOSIT
      );
      await expect(
        kingOfTheFools
          .connect(user1)
          .depositUSDCWithPermit(receiveAuthorizationForUser1)
      )
        .to.emit(kingOfTheFools, "NewKingOfTheFools")
        .withArgs(user1Address, USDC_DEPOSIT, CURRENCY_USDC, anyValue);

      expect(
        await USDC_CONTRACT.balanceOf(kingOfTheFools.address)
      ).to.be.equals(USDC_DEPOSIT);

      // User2 Deposits
      const receiveAuthorizationForUser2 = await getDataForReceiveWithPermit(
        user2,
        USDC_CONTRACT,
        kingOfTheFools.address,
        HIGHER_USDC_DEPOSIT
      );
      await expect(
        kingOfTheFools
          .connect(user2)
          .depositUSDCWithPermit(receiveAuthorizationForUser2)
      )
        .to.emit(kingOfTheFools, "NewKingOfTheFools")
        .withArgs(user2Address, HIGHER_USDC_DEPOSIT, CURRENCY_USDC, anyValue);

      // Check that Claim is registered for User1
      const user1Claim = await kingOfTheFools.pendingClaims(user1Address);
      expect(user1Claim[0].eq(HIGHER_USDC_DEPOSIT)).to.equals(true);
      expect(user1Claim[1].eq(0)).to.equals(true);
    });

    it("should not allow depositing USDC with someone else's permit", async function () {
      // User1 gets permit
      const receiveAuthorizationForUser1 = await getDataForReceiveWithPermit(
        user1,
        USDC_CONTRACT,
        kingOfTheFools.address,
        USDC_DEPOSIT
      );

      // User2 tries to use it
      await expect(
        kingOfTheFools
          .connect(user2)
          .depositUSDCWithPermit(receiveAuthorizationForUser1)
      ).to.be.revertedWithCustomError(kingOfTheFools, "PermitNotFromSender");
    });

    it("should emit Withdrawal event when a past king of fools to withdraws USDC claim reward", async function () {
      // Deposits
      await kingOfTheFools
        .connect(user1)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);
      await kingOfTheFools
        .connect(user2)
        .depositUSDCWithoutPermit(HIGHER_USDC_DEPOSIT);

      await expect(kingOfTheFools.connect(user1).withdrawClaim())
        .to.emit(kingOfTheFools, "Withdrawal")
        .withArgs(user1Address, HIGHER_USDC_DEPOSIT, 0, anyValue);
    });

    it("should emit Withdrawal event when a past king of fools to withdraws ETH claim reward", async function () {
      // Deposits
      await kingOfTheFools
        .connect(user1)
        .depositUSDCWithoutPermit(USDC_DEPOSIT);
      await kingOfTheFools
        .connect(user2)
        .depositETH({ value: HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT });

      await expect(kingOfTheFools.connect(user1).withdrawClaim())
        .to.emit(kingOfTheFools, "Withdrawal")
        .withArgs(
          user1Address,
          0,
          HIGHER_ETH_DEPOSIT_AFTER_USDC_DEPOSIT,
          anyValue
        );
    });

    it("should not allow any operation when paused but allows when unpaused", async function () {
      // Owner pauses contract
      await kingOfTheFools.pause();
      await expect(
        kingOfTheFools.connect(user1).depositETH({ value: ETH_DEPOSIT })
      ).to.be.revertedWith("Pausable: paused");
      await expect(
        kingOfTheFools.connect(user1).depositUSDCWithoutPermit(USDC_DEPOSIT)
      ).to.be.revertedWith("Pausable: paused");

      // Deposit with permit
      const receiveAuthorizationForUser1 = await getDataForReceiveWithPermit(
        user1,
        USDC_CONTRACT,
        kingOfTheFools.address,
        USDC_DEPOSIT
      );
      await expect(
        kingOfTheFools
          .connect(user1)
          .depositUSDCWithPermit(receiveAuthorizationForUser1)
      ).to.be.revertedWith("Pausable: paused");

      // Withdraw claim
      await expect(
        kingOfTheFools.connect(user1).withdrawClaim()
      ).to.be.revertedWith("Pausable: paused");

      // Owner pauses contract
      await kingOfTheFools.unpause();

      // Depositing after unpausing
      await expect(
        kingOfTheFools
          .connect(user1)
          .depositUSDCWithPermit(receiveAuthorizationForUser1)
      )
        .to.emit(kingOfTheFools, "NewKingOfTheFools")
        .withArgs(user1Address, USDC_DEPOSIT, CURRENCY_USDC, anyValue);
    });

    it("should not allow interaction with implementation contract", async function () {
      // Owner pauses contract
      const implementationContract = await ethers.getContractAt(
        "KingOfTheFools",
        upgrades.erc1967.getImplementationAddress(kingOfTheFools.address)
      );
      await expect(
        implementationContract.connect(user1).depositETH({ value: ETH_DEPOSIT })
      ).to.be.revertedWithCustomError(
        implementationContract,
        "NotDelegateCall"
      );
    });
  });
});
