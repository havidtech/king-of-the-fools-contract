//SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IKingOfTheFools {
    struct PendingClaim {
        uint256 usdc;
        uint256 eth;
    }

    error NotDelegateCall();
    error InsufficientDeposit();
    error NothingToClaim();
    error RescuingUSDCNotAllowed();
    error CurrentKingCannotParticipate();
    error PermitNotFromSender();

    /// @notice Emit when someone makes a valid deposit
    /// @dev Making a valid deposit makes you the new king of the fools
    /// @param kingOfTheFools The new king of the fools
    /// @param highestDeposit The new highest deposit
    /// @param currencyOfHighestDeposit Whether ETH or USD
    event NewKingOfTheFools(
        address indexed kingOfTheFools,
        uint256 indexed highestDeposit,
        uint256 indexed currencyOfHighestDeposit,
        uint256 time
    );

    /// @notice Emitted when a past king of the fools sucessfully claims usdc or eth or both
    /// @param usdc Amount of USDC claimed
    /// @param usdc Amount of ETH claimed
    event Withdrawal(
        address indexed pastKingOfTheFool,
        uint256 indexed usdc,
        uint256 indexed eth,
        uint256 time
    );

    /// @notice This function setsup the king of the fools contract,
    /// for example it makes the contract itself the first king of the fools
    /// @dev Initializers for all parent upgradable contracts are called here.
    function initialize() external;

    /// @notice Enables a user to make deposit without an initial approve transaction
    /// @dev EIP3009 function receiveWithAuthorization helps us send USDC from user to the contract
    /// @param receiveAuthorization call data for calling EIP3009.receiveWithAuthorization
    function depositUSDCWithPermit(bytes calldata receiveAuthorization)
        external;

    /// @notice User makes deposit but needed to have approved this contract to spend.
    /// @param deposit Amount of USDC to be deposited
    function depositUSDCWithoutPermit(uint256 deposit) external;

    /// @notice Deposit Ether in wei.
    function depositETH() external payable;

    /// @notice Past kings of the fools can use this function to claim their rewards.
    /// @dev Any pending ETH or USDC is claimed in this call
    function withdrawClaim() external;

    /// @notice The Owner of the contract can withdraw what is due the contract.
    /// @dev Any pending ETH or USDC is cliamed in this call
    function withdrawContractsClaim() external;

    /// @notice Enables contract admin to disable access to critical function in the wake of an emergency
    function pause() external;

    /// @notice Enables contract admin to reenable access to critical functions after an emergency
    function unpause() external;
}
