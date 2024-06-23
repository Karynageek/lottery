// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title Lottery contract.
 * This contract allows users to buy tickets for a lottery.
 * It uses Chainlink VRF to generate a random number for the lottery winner.
 */
contract Lottery is VRFConsumerBaseV2Plus {
    using Address for address payable;

    error LotteryEnded();
    error LotteryNotEnded();
    error TicketsAreZero();
    error FeeIsZero();
    error DurationIsZero();
    error AmountLessThanTickets();
    error NotWinner();
    error WinnerAlreadyClaimed();
    error MaxTicketsExceeded();
    error RequestAlreadyFulfilled();
    error WinnerAlreadyDrawn();
    error TicketPriceIsZero();
    error RequestDoesNotExist();

    struct LotteryInfo {
        uint256 maxTickets;
        uint256 fees;
        uint256 endAt;
        uint256 ticketPrice;
        bool isClaimed;
        address winner;
        address[] tickets;
    }
    struct RequestStatus {
        uint256 lotteryId;
        uint256 randomNumber;
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
    }

    // Chainlink VRF Coordinator Configuration
    uint32 constant CALLBACK_GAS_LIMIT = 100000;
    uint16 constant REQUEST_CONFIRMATIONS = 3;
    uint32 constant NUM_WORDS = 1;

    uint256 immutable s_subscriptionId;
    bytes32 immutable s_keyHash;

    address public feeReceiver;
    uint256 public lotteryCount = 0;

    mapping(uint256 => RequestStatus) public s_requests;
    mapping(uint256 => LotteryInfo) public lottery;

    event LotteryCreated(
        uint256 maxTickets,
        uint256 fees,
        uint256 endAt,
        uint256 ticketPrice
    );
    event Bought(
        address indexed player,
        uint256 indexed lotteryId,
        uint256 ticketsCount
    );
    event RequestSent(uint256 indexed requestId);
    event RequestFulfilled(uint256 indexed requestId, uint256 randomNumber);
    event Claimed(
        address indexed winner,
        uint256 indexed lotteryId,
        uint256 amount
    );
    event FeeReceiverWalletChanged(address indexed feeReceiver);

    /**
     * @notice Deploys contract.
     * @param subscriptionId_ Chainlink VRF subscription ID.
     * @param feeReceiver_ Address of the fee receiver.
     * @param vrfCoordinatorV2Plus_ Chainlink VRF Coordinator address.
     * @param keyHash_ Chainlink VRF key hash.
     */
    constructor(
        uint256 subscriptionId_,
        address feeReceiver_,
        address vrfCoordinatorV2Plus_,
        bytes32 keyHash_
    ) VRFConsumerBaseV2Plus(vrfCoordinatorV2Plus_) {
        s_subscriptionId = subscriptionId_;
        s_keyHash = keyHash_;
        feeReceiver = feeReceiver_;
    }

    /**
     * @notice Fallback function to receive native coins.
     */
    receive() external payable {}

    /**
     * @notice Buys tickets for a lottery.
     * @param _lotteryId ID of the lottery.
     * @param _tickets Number of tickets to buy.
     */
    function buyTickets(uint256 _lotteryId, uint256 _tickets) external payable {
        if (_tickets == 0) {
            revert TicketsAreZero();
        }
        if (msg.value != _tickets * lottery[_lotteryId].ticketPrice) {
            revert AmountLessThanTickets();
        }
        if (_tickets > lottery[_lotteryId].maxTickets) {
            revert MaxTicketsExceeded();
        }
        if (block.timestamp >= lottery[_lotteryId].endAt) {
            revert LotteryEnded();
        }

        for (uint256 i = 0; i < _tickets; i++) {
            lottery[_lotteryId].tickets.push(msg.sender);
        }

        emit Bought(msg.sender, _lotteryId, _tickets);
    }

    /**
     * @notice Creates a new lottery.
     * @param _duration Duration of the lottery in seconds.
     * @param _fees Fees in percentage.
     * @param _maxTickets Maximum number of tickets.
     * @param _ticketPrice Price of a ticket.
     */
    function createLottery(
        uint256 _duration,
        uint256 _fees,
        uint256 _maxTickets,
        uint256 _ticketPrice
    ) external onlyOwner {
        if (_maxTickets == 0) {
            revert TicketsAreZero();
        }
        if (_fees == 0) {
            revert FeeIsZero();
        }
        if (_duration == 0) {
            revert DurationIsZero();
        }
        if (_ticketPrice == 0) {
            revert TicketPriceIsZero();
        }
        uint256 endAt = block.timestamp + _duration;

        lottery[lotteryCount] = LotteryInfo({
            maxTickets: _maxTickets,
            fees: _fees,
            endAt: endAt,
            ticketPrice: _ticketPrice,
            isClaimed: false,
            winner: address(0),
            tickets: new address[](0)
        });

        lotteryCount++;

        emit LotteryCreated(_maxTickets, _fees, endAt, _ticketPrice);
    }

    /**
     * @notice Draws a winner for the lottery.
     * @param _lotteryId ID of the lottery.
     */
    function win(uint256 _lotteryId) external {
        if (block.timestamp < lottery[_lotteryId].endAt) {
            revert LotteryNotEnded();
        }
        if (lottery[_lotteryId].winner != address(0)) {
            revert WinnerAlreadyDrawn();
        }
        _requestRandomWords(_lotteryId);
    }

    /**
     * @notice Allows the winner to claim the prize.
     * @param _lotteryId ID of the lottery.
     */
    function claim(uint256 _lotteryId) external {
        LotteryInfo memory lotteryInfo = lottery[_lotteryId];

        if (lotteryInfo.winner != msg.sender) {
            revert NotWinner();
        }
        if (lotteryInfo.isClaimed) {
            revert WinnerAlreadyClaimed();
        }

        lottery[_lotteryId].isClaimed = true;

        uint256 totalAmount = lotteryInfo.tickets.length *
            lotteryInfo.ticketPrice;
        uint256 fees = (totalAmount * lotteryInfo.fees) / 100;
        uint256 winnerAmount = totalAmount - fees;

        payable(feeReceiver).sendValue(fees);
        payable(msg.sender).sendValue(winnerAmount);

        emit Claimed(msg.sender, _lotteryId, winnerAmount);
    }

    /**
     * @notice Sets the address of the fee receiver.
     * @param _feeReceiver New address of the fee receiver.
     */
    function setFeeReceiver(address _feeReceiver) external onlyOwner {
        if (_feeReceiver == address(0)) {
            revert ZeroAddress();
        }
        feeReceiver = _feeReceiver;

        emit FeeReceiverWalletChanged(_feeReceiver);
    }

    /**
     * @notice Returns the tickets of a lottery.
     * @param _lotteryId ID of the lottery.
     * @return tickets Tickets of the lottery.
     */
    function getTickets(
        uint256 _lotteryId
    ) external view returns (address[] memory) {
        return lottery[_lotteryId].tickets;
    }

    function getRequestStatus(
        uint256 _requestId
    ) external view returns (bool fulfilled, uint256 randomNumber) {
        if (!s_requests[_requestId].exists) {
            revert RequestDoesNotExist();
        }
        RequestStatus memory request = s_requests[_requestId];
        return (request.fulfilled, request.randomNumber);
    }

    function _requestRandomWords(uint256 _lotteryId) private {
        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: s_keyHash,
                subId: s_subscriptionId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit: CALLBACK_GAS_LIMIT,
                numWords: NUM_WORDS,
                // Set nativePayment to true to pay for VRF requests with Sepolia ETH instead of LINK
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );

        s_requests[requestId] = RequestStatus({
            lotteryId: _lotteryId,
            randomNumber: 0,
            fulfilled: false,
            exists: true
        });

        emit RequestSent(requestId);
    }

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] calldata _randomWords
    ) internal override {
        if (s_requests[_requestId].fulfilled) {
            revert RequestAlreadyFulfilled();
        }
        uint256 lotteryId = s_requests[_requestId].lotteryId;
        uint256 requestNumber = _randomWords[0];
        lottery[lotteryId].tickets.length;

        s_requests[_requestId].fulfilled = true;
        s_requests[_requestId].randomNumber = requestNumber;
        lottery[lotteryId].winner = lottery[lotteryId].tickets[requestNumber];

        emit RequestFulfilled(_requestId, requestNumber);
    }
}
