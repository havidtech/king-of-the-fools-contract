//SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./IKingOfTheFools.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AddressUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {DepositsComparator} from "./DepositsComparator.sol";
import {IEIP3009} from "./IEIP3009.sol";

/// @title King of the Fools
/// @author David, Enebeli
/// @notice Deposit atleast 1.5 more to become the king of fools.
/// @notice The previous king of fools then withdraws your deposit
/// @notice All deposits are in units, Wei and USDC units
/// @dev This contract is designed to be called by a Transparent proxy.
/// @dev Deploy using Openzeppelin upgrade plugin
contract KingOfTheFools is
    IKingOfTheFools,
    Initializable,
    PausableUpgradeable,
    OwnableUpgradeable
{
    using AddressUpgradeable for address;
    using AddressUpgradeable for address payable;
    using DepositsComparator for uint256;


    mapping(address => PendingClaim) public pendingClaims;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address immutable __self;

    address public kingOfTheFools;
    uint256 public highestDeposit;
    uint256 public currencyOfHighestDeposit;

    address constant USDC = 0x07865c6E87B9F70255377e024ace6630C1Eaa37F; //Ethereum Goerli

    ///@dev Check that the execution is being performed through a delegatecall call
    modifier onlyProxy() {
        if (address(this) == __self) revert NotDelegateCall();
        _;
    }

    /// @dev Check that the deposit is atleast 1.5 *  highestDeposit
    modifier onlyValidDeposit(uint256 deposit, uint256 currency) {
        requireValidDeposit(deposit, currency);
        _;
    }

    /// @dev Check the person trying to be become king is not already a king
    /// @dev If allowed, a person can become a king of the fools without cost.
    /// @dev For example: deposit 1Eth, deposit 10Eth, claim 10Eth then wait to get atleast another 15Eth
    modifier notCurrentKing() {
        if (msg.sender == kingOfTheFools) revert CurrentKingCannotParticipate();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        __self = address(this);
        _transferOwnership(msg.sender);
        _pause();
    }

    /// @inheritdoc	IKingOfTheFools
    function initialize() external onlyProxy initializer {
        __Ownable_init();
        __Pausable_init();
        kingOfTheFools = address(this); // Make contract the current king of the fools
    }

    /// @inheritdoc	IKingOfTheFools
    function depositUSDCWithPermit(bytes calldata receiveAuthorization)
        external
        notCurrentKing
        onlyProxy
        whenNotPaused
    {
        (address from, address to, uint256 deposit) = abi.decode(
            receiveAuthorization[0:96],
            (address, address, uint256)
        );
        to; // Ignore unused variable. no need to require as that is done in USDC

        requireValidDeposit(deposit, DepositsComparator.USDC_CURRENCY);
        if (from != msg.sender) revert PermitNotFromSender();

        onDeposit(deposit, DepositsComparator.USDC_CURRENCY);

        USDC.functionCall(
            abi.encodePacked(
                IEIP3009.receiveWithAuthorization.selector,
                receiveAuthorization
            )
        );

        emit NewKingOfTheFools(
            msg.sender,
            deposit,
            DepositsComparator.USDC_CURRENCY,
            block.timestamp
        );
    }

    /// @inheritdoc	IKingOfTheFools
    function depositUSDCWithoutPermit(uint256 deposit)
        external
        notCurrentKing
        onlyValidDeposit(deposit, DepositsComparator.USDC_CURRENCY)
        onlyProxy
        whenNotPaused
    {
        onDeposit(deposit, DepositsComparator.USDC_CURRENCY);

        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(address(USDC)),
            msg.sender,
            address(this),
            deposit
        );

        emit NewKingOfTheFools(
            msg.sender,
            deposit,
            DepositsComparator.USDC_CURRENCY,
            block.timestamp
        );
    }

    /// @inheritdoc	IKingOfTheFools
    function depositETH()
        external
        payable
        notCurrentKing
        onlyValidDeposit(msg.value, DepositsComparator.ETH_CURRENCY)
        onlyProxy
        whenNotPaused
        onlyValidDeposit(msg.value, DepositsComparator.ETH_CURRENCY)
    {
        onDeposit(msg.value, DepositsComparator.ETH_CURRENCY);

        emit NewKingOfTheFools(
            msg.sender,
            msg.value,
            DepositsComparator.ETH_CURRENCY,
            block.timestamp
        );
    }

    /// @inheritdoc	IKingOfTheFools
    function withdrawClaim() external onlyProxy whenNotPaused {
        _withdrawClaim(msg.sender, msg.sender);
    }

    /// @inheritdoc	IKingOfTheFools
    function withdrawContractsClaim() external onlyProxy onlyOwner {
        _withdrawClaim(address(this), msg.sender);
    }

    /// @inheritdoc	IKingOfTheFools
    function pause() external onlyOwner {
        _pause();
    }

    /// @inheritdoc	IKingOfTheFools
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Called to Apply the effect of a deposit before actual transfer
    /// @dev in harmony with Checks-Effects-Interaction
    /// @dev Includes setting the new king of the fools and accumulating claims for the outgoing king
    /// @param deposit  Amount deposited
    /// @param currency Whether deposit was made in USDC or ETH
    function onDeposit(uint256 deposit, uint256 currency) internal {
        if (currency == DepositsComparator.ETH_CURRENCY)
            pendingClaims[kingOfTheFools].eth += deposit;
        else pendingClaims[kingOfTheFools].usdc += deposit;

        kingOfTheFools = msg.sender;
        highestDeposit = deposit;
        currencyOfHighestDeposit = currency;
    }

    function _withdrawClaim(address pastKingOfTheFools, address recipient)
        internal
    {
        PendingClaim memory claim = pendingClaims[pastKingOfTheFools];
        if (claim.usdc == 0 && claim.eth == 0) revert NothingToClaim();
        if (claim.usdc != 0) {
            pendingClaims[pastKingOfTheFools].usdc = 0;
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(address(USDC)),
                recipient,
                claim.usdc
            );
        }
        if (claim.eth != 0) {
            pendingClaims[pastKingOfTheFools].eth = 0;
            payable(recipient).sendValue(claim.eth);
        }

        emit Withdrawal(pastKingOfTheFools, claim.usdc, claim.eth, block.timestamp);
    }

    /// @dev Uses the DepositsComparator library to compare deposit with highestDeposit
    /// @param deposit The amount deposited
    /// @param currency Whether deposit is USDC or ETH
    function requireValidDeposit(uint256 deposit, uint256 currency)
        internal
        view
    {
        if (
            deposit == 0 ||
            !deposit.greaterThanOrEquals(
                currency,
                highestDeposit,
                currencyOfHighestDeposit
            )
        ) revert InsufficientDeposit();
    }
}
