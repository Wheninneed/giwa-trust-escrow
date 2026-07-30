// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title MockKRW — 테스트넷 전용 원화 표시 토큰
/// @notice **이 토큰은 실제 가치가 없습니다.** GIWA Sepolia 테스트넷에서
///         에스크로 흐름을 시연하기 위한 목적으로만 존재하며, 실제 원화·예금·
///         전자화폐 어느 것과도 교환되지 않습니다. 메인넷에 배포하지 마십시오.
/// @dev 원화의 관례를 따라 소수점 자리를 6으로 둔다. 1 mKRW = 1_000_000 단위.
contract MockKRW is ERC20, Ownable2Step {
    /// @notice faucet 1회 지급량 — 데모 계약(5,000만 mKRW)을 여유 있게 덮는 값
    uint256 public constant FAUCET_AMOUNT = 100_000_000 * 10 ** 6;

    /// @notice 동일 주소의 faucet 재호출 대기 시간
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @notice 배포자 초기 물량 — 데모 시딩 및 심사용 계정 배분에 사용
    uint256 public constant INITIAL_SUPPLY = 10_000_000_000 * 10 ** 6;

    /// @notice 주소별 마지막 faucet 호출 시각
    mapping(address account => uint256 claimedAt) public lastFaucetAt;

    event FaucetClaimed(address indexed account, uint256 amount);

    error FaucetCooldownNotElapsed(uint256 availableAt);

    /// @param initialOwner 관리자 주소. 테스트넷 운영 계정을 넣는다.
    constructor(address initialOwner) ERC20("Mock Korean Won", "mKRW") Ownable(initialOwner) {
        _mint(initialOwner, INITIAL_SUPPLY);
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice 데모용 테스트 토큰을 받는다. 쿨다운 내 재호출은 되돌린다.
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (last != 0) {
            uint256 availableAt = last + FAUCET_COOLDOWN;
            if (block.timestamp < availableAt) {
                revert FaucetCooldownNotElapsed(availableAt);
            }
        }

        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice 심사용 계정에 초기 물량을 배분하기 위한 관리자 기능.
    /// @dev 테스트넷 전용. 실제 자산이 아니므로 발행 상한을 두지 않는다.
    function mintTo(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice 다음 faucet 호출이 가능한 시각. 한 번도 받지 않았으면 0.
    function faucetAvailableAt(address account) external view returns (uint256) {
        uint256 last = lastFaucetAt[account];
        return last == 0 ? 0 : last + FAUCET_COOLDOWN;
    }
}
