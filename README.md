# 👑 King of Fools

This is a game of Kings! 🤺 

#### Test Coverage: 100/100

## 🤠 How it works?

1️⃣ Any user can deposit ETH or USDC into the contract, the first person to deposit into the contract sets the start price for the throne, whatever amount deposited by the first user becomes the base reference price for the throne and the person becomes the first king of the fools.

2️⃣ The next person to deposit into the contract has to send in 1.5x, where x is the previous deposit.
Note: For every new king, the price of the throne gets 1.5x more expensive.
If a user sends less than 1.5 the previous deposit, the transaction reverts and he cannot be the next king of the Fools.

3️⃣ Once there is a new valid transaction for a new king of the fools, the previous king is dethroned and the new user becomes the new king of the fools, but the previous king can call the claim function anytime to get their financial claim for the thrown


## Project Breakdown:

### King of Fools Smart Contract 🕹

The contract has 3 core functionality:
=> Deposit ETH: Called to deposit ETH into the contract to claim the throne
=> Deposit USDC: Called to deposit USDC into the contract to claim the throne
=> Withdraw Claim: Called by the previous king of fools to withdraw their financial Claim

### Additional Functionality:
- Pause and Unpause contract: This is admin only functionality to pause and unpause the contract in case of emergency
- Withdraw contract claim: The contract admin can withdraw claim of the contract, this is the first ever deposit made to the contract

### Core dependencies:
- OpenZeppelin contracts: Transparency proxy for upgradability and other utility contracts
- Chainlink price feed: For retreiving the late latest ETH/USD rate


### A King of Fools frontend 💫

- You can interact with the contract through the project UI deployed [here](https://king-of-the-fools-ui.vercel.app/). [See Source code](https://github.com/havidtech/king-of-the-fools-ui)

or

- You can interact with the deployed contract on Goerli testnet directly:
[Contract address](https://goerli.etherscan.io/address/0x4dA28Ff81bB435E221c6743471d813b207D28386#writeProxyContract)

### Artifacts
- [Implementation Contract](https://goerli.etherscan.io/address/0x007ff1fc2709f6ecedab3021804f0c330c83ea72#code)
- [Proxy Contract](https://goerli.etherscan.io/address/0x4dA28Ff81bB435E221c6743471d813b207D28386#writeProxyContract)
- [Proxy Admin](https://goerli.etherscan.io/address/0xa273cE8DD82Fa9F95865766B37b13d9AFD7c03b2#writeContract)

###🚨 Security considerations taken:

- 1️⃣ A current king of the fools cannot deposit into the contract next to claim the throne from himself. If this measure wasn't taken, imagine if the current cost to be the king of the fool is 1ETH, a hacker can deposit 1ETh to become the new king of the fools, this 1ETH goes to the prev king, then he deposits 100ETH (overly satisfies 1.5x) again to claim the throne from himself, the 100ETH goes back to him, increasing the cost to become the new king. Another user comes in and pays 150ETH to claim the throne, this funds goes back to the hacker, this way, the hacker has manipulated the cost of the throne for himself.

- 2️⃣ Separated the deposit and withdraw functions. This ensure that the current king does not remain King for ever. A king can be a king for ever if he deposited into the King of Fools contract from a smart contract that rejects ETH, this means a new depositors transaction will always fail. See [Withdrawal Pattern](https://docs.soliditylang.org/en/v0.8.15/common-patterns.html#withdrawal-from-contracts)

- 3️⃣ Check effect interaction pattern to avoid re-entrancy attacks.


## 🎬 How to get started:

### 👯‍♂️ User?

- Go to the king of fools project website

- Ensure you have metamask chrome extension installed, if you don't, you can read this article on how to [install metamask on Chrome](https://blog.wetrust.io/how-to-install-and-use-metamask-7210720ca047?gi=aa6469944371)

- Connect your wallet to the site

- On the UI, you can see stats about the project, there is a wall of fame containing list of kings from the newest to the oldest, highlighting all previous kings of fools and their deposit amount. By Looking at the newest info, you can tell what the next cost should be. 

- Assuming the previous payment was in ETH and you want to pay in USDC, the site shows you the current rate of conversion from chainlink


- You can see and withdraw your claim, if the throne was taken from you by a new king of the fools


### 👩🏻‍💻 Contributor / Dev?
- Ensure you have NodeJs, and yarn installed

- Clone the repo locally

- Run "yarn install", to install all dependencies

- To run the test, navigate to packages/hardhat directory, by running the "yarn test" command

- To see the test coverage, navigate to packages/hardhat directory and run "yarn coverage"

- Deploy the contract locally and play around with it

Enjoy!


