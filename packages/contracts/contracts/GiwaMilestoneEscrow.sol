// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title GiwaMilestoneEscrow — 단계별 지급 서비스 거래 에스크로
/// @notice 고객이 서비스 대금 전액을 먼저 예치하고, 업체가 합의된 작업 단계의
///         완료 증빙을 제출하면 고객 승인에 따라 해당 단계 금액만 지급한다.
///         분쟁이 생기면 해당 금액을 동결하고 사전 지정된 중재자가 배분한다.
/// @dev 개인정보·견적서 원문·주소·연락처는 온체인에 저장하지 않는다. 금액, 역할
///      주소, 상태, 타임스탬프, 해시, 표시용 메타데이터만 기록한다.
contract GiwaMilestoneEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // 상태 정의
    // ---------------------------------------------------------------------

    enum AgreementStatus {
        Created, // 생성되었지만 아직 전액 예치 전
        Active, // 전액 예치 후 진행 중
        Disputed, // 분쟁 중
        CancelPending, // 상호 취소 승인 대기
        Completed, // 모든 마일스톤 정산 완료
        Cancelled // 잔액 환불 후 취소 완료
    }

    enum MilestoneStatus {
        Pending, // 아직 업체 제출 전
        Submitted, // 완료 증빙 제출
        RevisionRequested, // 고객이 보완 요청
        Approved, // 고객 승인 (하자보증금은 잠금 해제 대기)
        Disputed, // 분쟁 중
        Resolved, // 중재로 정산
        Paid // 전액 업체 지급
    }

    enum ChangeOrderStatus {
        Proposed,
        Accepted,
        Funded,
        Rejected,
        Cancelled
    }

    /// @dev 사람이 읽는 텍스트를 하나의 이벤트 채널로 모으기 위한 구분자
    enum NoteKind {
        Evidence, // 업체 증빙 설명
        Revision, // 고객 보완 요청 사유
        Dispute, // 분쟁 사유
        Approval, // 고객 승인 메모
        Resolution, // 중재 결정 설명
        Cancellation // 취소 사유
    }

    struct Agreement {
        uint256 id;
        address client;
        address provider;
        address arbiter;
        IERC20 paymentToken;
        uint256 originalAmount;
        uint256 totalFunded;
        uint256 totalReleased;
        uint256 totalRefunded;
        uint64 createdAt;
        uint64 fundedAt;
        AgreementStatus status;
        bytes32 termsHash;
        string metadataURI;
    }

    struct Milestone {
        uint256 amount;
        uint64 dueAt;
        uint64 retentionReleaseAt;
        bool isRetention;
        MilestoneStatus status;
        bytes32 titleHash;
        bytes32 evidenceHash;
        bytes32 responseHash;
        uint64 submittedAt;
        uint64 resolvedAt;
    }

    struct ChangeOrder {
        uint256 id;
        uint256 agreementId;
        address proposer;
        uint256 additionalAmount;
        uint64 additionalDays;
        uint64 proposedAt;
        ChangeOrderStatus status;
        bytes32 metadataHash;
        string metadataURI;
    }

    // ---------------------------------------------------------------------
    // 상수
    // ---------------------------------------------------------------------

    uint256 public constant MIN_MILESTONES = 2;
    uint256 public constant MAX_MILESTONES = 10;
    /// @dev 변경계약으로 늘어날 수 있는 여지를 포함한 상한. 조회 함수가 배열을
    ///      통째로 반환하므로 무한정 늘어나지 않도록 막는다.
    uint256 public constant MAX_TOTAL_MILESTONES = 20;
    uint256 public constant MAX_URI_LENGTH = 4096;
    uint256 public constant MAX_NOTE_LENGTH = 1024;

    // ---------------------------------------------------------------------
    // 저장소
    // ---------------------------------------------------------------------

    uint256 public agreementCount;

    mapping(uint256 agreementId => Agreement) private _agreements;
    mapping(uint256 agreementId => Milestone[]) private _milestones;
    mapping(uint256 agreementId => ChangeOrder[]) private _changeOrders;
    mapping(uint256 agreementId => uint256 count) private _openDisputes;
    mapping(uint256 agreementId => address proposer) private _cancelProposer;

    mapping(address client => uint256[] agreementIds) private _clientAgreements;
    mapping(address provider => uint256[] agreementIds) private _providerAgreements;
    mapping(address arbiter => uint256[] agreementIds) private _arbiterAgreements;

    // ---------------------------------------------------------------------
    // 이벤트
    // ---------------------------------------------------------------------

    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed client,
        address indexed provider,
        address arbiter,
        address paymentToken,
        uint256 totalAmount,
        bytes32 termsHash
    );
    event AgreementFunded(uint256 indexed agreementId, uint256 amount);
    event MilestoneSubmitted(uint256 indexed agreementId, uint256 indexed milestoneIndex, bytes32 evidenceHash);
    event RevisionRequested(uint256 indexed agreementId, uint256 indexed milestoneIndex, bytes32 reasonHash);
    event MilestoneApproved(uint256 indexed agreementId, uint256 indexed milestoneIndex, bytes32 approvalHash);
    event MilestonePaid(
        uint256 indexed agreementId, uint256 indexed milestoneIndex, address indexed provider, uint256 amount
    );
    event DisputeRaised(
        uint256 indexed agreementId, uint256 indexed milestoneIndex, address indexed raisedBy, bytes32 reasonHash
    );
    event DisputeResolved(
        uint256 indexed agreementId,
        uint256 indexed milestoneIndex,
        uint256 providerAmount,
        uint256 clientRefundAmount,
        bytes32 resolutionHash
    );
    event ChangeOrderProposed(
        uint256 indexed agreementId, uint256 indexed changeOrderId, address indexed proposer, uint256 additionalAmount
    );
    event ChangeOrderAccepted(uint256 indexed agreementId, uint256 indexed changeOrderId);
    event ChangeOrderFunded(uint256 indexed agreementId, uint256 indexed changeOrderId, uint256 amount);
    event MilestoneAdded(uint256 indexed agreementId, uint256 indexed milestoneIndex, uint256 amount, uint64 dueAt);
    event CancellationProposed(uint256 indexed agreementId, address indexed proposer, bytes32 reasonHash);
    event CancellationWithdrawn(uint256 indexed agreementId, address indexed withdrawnBy);
    event AgreementCancelled(uint256 indexed agreementId, uint256 refundAmount);
    event AgreementCompleted(uint256 indexed agreementId);

    /// @notice 사람이 읽는 설명문 전용 채널. 온체인 상태에는 해시만 남기고
    ///         원문은 이벤트 로그로만 노출해 저장 비용과 노출 범위를 줄인다.
    event MilestoneNote(
        uint256 indexed agreementId, uint256 indexed milestoneIndex, address indexed author, NoteKind kind, string note
    );

    // ---------------------------------------------------------------------
    // 오류
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error DuplicateRole();
    error InvalidMilestoneCount();
    error ArrayLengthMismatch();
    error ZeroAmount();
    error InvalidDueDate();
    error MultipleRetentionMilestones();
    error RetentionMustBeLast();
    error InvalidRetentionRelease();
    error StringTooLong();
    error UnknownAgreement();
    error NotClient();
    error NotProvider();
    error NotArbiter();
    error NotParty();
    error InvalidAgreementStatus();
    error InvalidMilestoneStatus();
    error MilestoneOutOfRange();
    error OutOfOrder();
    error FundingAmountMismatch();
    error ZeroEvidenceHash();
    error RetentionNotMatured();
    error NotRetentionMilestone();
    error IsRetentionMilestone();
    error ResolutionAmountMismatch();
    error UnknownChangeOrder();
    error InvalidChangeOrderStatus();
    error CannotAcceptOwnProposal();
    error RetentionAlreadyStarted();
    error TooManyMilestones();
    error SelfAcceptCancellation();

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ---------------------------------------------------------------------
    // 계약 생성 및 예치
    // ---------------------------------------------------------------------

    /// @notice 새 서비스 계약을 만든다. 이 시점에는 자금이 이동하지 않는다.
    /// @param milestoneAmounts 단계별 금액. 합계가 계약 총액이 된다.
    /// @param dueDates 단계별 예정 완료일. 같거나 증가하는 순서여야 한다.
    /// @param retentionFlags 하자보증금 단계 여부. 최대 1개, 마지막 순서만 허용.
    /// @param titleHashes 단계명 해시. 원문은 metadataURI 로 전달한다.
    /// @param termsHash 계약 조건 원문의 해시
    /// @param metadataURI 표시용 메타데이터(JSON 또는 URL). 개인정보 금지.
    function createAgreement(
        address provider,
        address arbiter,
        address paymentToken,
        uint256[] calldata milestoneAmounts,
        uint64[] calldata dueDates,
        bool[] calldata retentionFlags,
        uint64[] calldata retentionReleaseDates,
        bytes32[] calldata titleHashes,
        bytes32 termsHash,
        string calldata metadataURI
    ) external whenNotPaused returns (uint256 agreementId) {
        if (provider == address(0) || arbiter == address(0) || paymentToken == address(0)) revert ZeroAddress();
        if (msg.sender == provider || msg.sender == arbiter || provider == arbiter) revert DuplicateRole();
        if (bytes(metadataURI).length > MAX_URI_LENGTH) revert StringTooLong();

        uint256 count = milestoneAmounts.length;
        if (count < MIN_MILESTONES || count > MAX_MILESTONES) revert InvalidMilestoneCount();
        if (
            dueDates.length != count || retentionFlags.length != count || retentionReleaseDates.length != count
                || titleHashes.length != count
        ) revert ArrayLengthMismatch();

        agreementId = agreementCount;
        agreementCount = agreementId + 1;

        uint256 total;
        bool retentionSeen;
        Milestone[] storage list = _milestones[agreementId];

        for (uint256 i = 0; i < count; ++i) {
            uint256 amount = milestoneAmounts[i];
            if (amount == 0) revert ZeroAmount();
            if (dueDates[i] == 0) revert InvalidDueDate();
            if (i > 0 && dueDates[i] < dueDates[i - 1]) revert InvalidDueDate();

            bool isRetention = retentionFlags[i];
            if (isRetention) {
                if (retentionSeen) revert MultipleRetentionMilestones();
                if (i != count - 1) revert RetentionMustBeLast();
                if (retentionReleaseDates[i] <= block.timestamp) revert InvalidRetentionRelease();
                retentionSeen = true;
            }

            total += amount;

            list.push(
                Milestone({
                    amount: amount,
                    dueAt: dueDates[i],
                    retentionReleaseAt: isRetention ? retentionReleaseDates[i] : 0,
                    isRetention: isRetention,
                    status: MilestoneStatus.Pending,
                    titleHash: titleHashes[i],
                    evidenceHash: bytes32(0),
                    responseHash: bytes32(0),
                    submittedAt: 0,
                    resolvedAt: 0
                })
            );
        }

        _agreements[agreementId] = Agreement({
            id: agreementId,
            client: msg.sender,
            provider: provider,
            arbiter: arbiter,
            paymentToken: IERC20(paymentToken),
            originalAmount: total,
            totalFunded: 0,
            totalReleased: 0,
            totalRefunded: 0,
            createdAt: uint64(block.timestamp),
            fundedAt: 0,
            status: AgreementStatus.Created,
            termsHash: termsHash,
            metadataURI: metadataURI
        });

        _clientAgreements[msg.sender].push(agreementId);
        _providerAgreements[provider].push(agreementId);
        _arbiterAgreements[arbiter].push(agreementId);

        emit AgreementCreated(agreementId, msg.sender, provider, arbiter, paymentToken, total, termsHash);
    }

    /// @notice 고객이 계약 총액 전부를 예치한다. 부분 예치는 허용하지 않는다.
    function fundAgreement(uint256 agreementId) external nonReentrant whenNotPaused {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client) revert NotClient();
        if (a.status != AgreementStatus.Created) revert InvalidAgreementStatus();

        uint256 amount = a.originalAmount;
        _pullExact(a.paymentToken, amount);

        a.totalFunded += amount;
        a.fundedAt = uint64(block.timestamp);
        a.status = AgreementStatus.Active;

        emit AgreementFunded(agreementId, amount);
    }

    // ---------------------------------------------------------------------
    // 마일스톤 진행
    // ---------------------------------------------------------------------

    /// @notice 업체가 해당 단계의 작업 완료 증빙 해시를 제출한다.
    function submitMilestone(uint256 agreementId, uint256 milestoneIndex, bytes32 evidenceHash) external {
        submitMilestone(agreementId, milestoneIndex, evidenceHash, "");
    }

    /// @param note 사람이 읽는 설명. 온체인 상태가 아니라 이벤트로만 남는다.
    function submitMilestone(uint256 agreementId, uint256 milestoneIndex, bytes32 evidenceHash, string memory note)
        public
    {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.provider) revert NotProvider();
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();
        if (evidenceHash == bytes32(0)) revert ZeroEvidenceHash();

        Milestone storage m = _requireMilestone(agreementId, milestoneIndex);
        if (m.status != MilestoneStatus.Pending && m.status != MilestoneStatus.RevisionRequested) {
            revert InvalidMilestoneStatus();
        }
        // 순차 진행: 앞선 단계가 모두 정산되어야 다음 단계를 제출할 수 있다.
        // 하자보증금 단계도 이 규칙에 따라 자동으로 가장 마지막에 열린다.
        if (milestoneIndex != _firstUnsettled(agreementId)) revert OutOfOrder();

        m.status = MilestoneStatus.Submitted;
        m.evidenceHash = evidenceHash;
        m.submittedAt = uint64(block.timestamp);

        emit MilestoneSubmitted(agreementId, milestoneIndex, evidenceHash);
        _emitNote(agreementId, milestoneIndex, NoteKind.Evidence, note);
    }

    /// @notice 고객이 단계를 승인한다. 일반 단계는 승인 즉시 업체에게 지급된다.
    ///         하자보증금 단계는 승인만 되고 잠금 해제 시점 이후 지급된다.
    function approveMilestone(uint256 agreementId, uint256 milestoneIndex, bytes32 approvalHash) external {
        approveMilestone(agreementId, milestoneIndex, approvalHash, "");
    }

    function approveMilestone(uint256 agreementId, uint256 milestoneIndex, bytes32 approvalHash, string memory note)
        public
        nonReentrant
        whenNotPaused
    {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client) revert NotClient();
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();

        Milestone storage m = _requireMilestone(agreementId, milestoneIndex);
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus();

        m.responseHash = approvalHash;
        emit MilestoneApproved(agreementId, milestoneIndex, approvalHash);
        _emitNote(agreementId, milestoneIndex, NoteKind.Approval, note);

        if (m.isRetention) {
            // 하자보증 잠금이 남아 있으므로 지급하지 않고 승인 상태로만 둔다.
            m.status = MilestoneStatus.Approved;
            return;
        }

        _payMilestone(a, m, agreementId, milestoneIndex);
        _settleIfComplete(a, agreementId);
    }

    /// @notice 고객이 보완을 요청한다. 업체는 새 증빙으로 재제출할 수 있다.
    function requestRevision(uint256 agreementId, uint256 milestoneIndex, bytes32 reasonHash) external {
        requestRevision(agreementId, milestoneIndex, reasonHash, "");
    }

    function requestRevision(uint256 agreementId, uint256 milestoneIndex, bytes32 reasonHash, string memory note)
        public
    {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client) revert NotClient();
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();

        Milestone storage m = _requireMilestone(agreementId, milestoneIndex);
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus();

        m.status = MilestoneStatus.RevisionRequested;
        m.responseHash = reasonHash;

        emit RevisionRequested(agreementId, milestoneIndex, reasonHash);
        _emitNote(agreementId, milestoneIndex, NoteKind.Revision, note);
    }

    /// @notice 하자보증 잠금기간이 끝난 뒤 보증금을 업체에게 지급한다.
    /// @dev 고객·업체 누구나 실행할 수 있다. 이미 고객이 승인한 금액이므로
    ///      업체가 직접 회수할 수 있어야 지급이 무한정 지연되지 않는다.
    function releaseRetention(uint256 agreementId, uint256 milestoneIndex) external nonReentrant whenNotPaused {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();

        Milestone storage m = _requireMilestone(agreementId, milestoneIndex);
        if (!m.isRetention) revert NotRetentionMilestone();
        if (m.status != MilestoneStatus.Approved) revert InvalidMilestoneStatus();
        if (block.timestamp < m.retentionReleaseAt) revert RetentionNotMatured();

        _payMilestone(a, m, agreementId, milestoneIndex);
        _settleIfComplete(a, agreementId);
    }

    // ---------------------------------------------------------------------
    // 분쟁
    // ---------------------------------------------------------------------

    /// @notice 고객 또는 업체가 분쟁을 제기한다. 해당 금액의 지급이 동결된다.
    function raiseDispute(uint256 agreementId, uint256 milestoneIndex, bytes32 reasonHash) external {
        raiseDispute(agreementId, milestoneIndex, reasonHash, "");
    }

    function raiseDispute(uint256 agreementId, uint256 milestoneIndex, bytes32 reasonHash, string memory note) public {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        // 취소 승인 대기 중에도 분쟁을 제기할 수 있어야 한다. 그렇지 않으면
        // 한쪽이 취소를 제안하는 것만으로 상대방의 이의 제기 수단을 막을 수 있다.
        if (
            a.status != AgreementStatus.Active && a.status != AgreementStatus.Disputed
                && a.status != AgreementStatus.CancelPending
        ) revert InvalidAgreementStatus();

        Milestone storage m = _requireMilestone(agreementId, milestoneIndex);
        bool disputable = m.status == MilestoneStatus.Submitted || m.status == MilestoneStatus.RevisionRequested
            || (m.isRetention && m.status == MilestoneStatus.Approved);
        if (!disputable) revert InvalidMilestoneStatus();

        // 분쟁이 시작되면 중재 절차가 우선하므로 계류 중인 취소 제안은 버린다.
        if (a.status == AgreementStatus.CancelPending) delete _cancelProposer[agreementId];

        m.status = MilestoneStatus.Disputed;
        _openDisputes[agreementId] += 1;
        a.status = AgreementStatus.Disputed;

        emit DisputeRaised(agreementId, milestoneIndex, msg.sender, reasonHash);
        _emitNote(agreementId, milestoneIndex, NoteKind.Dispute, note);
    }

    /// @notice 지정된 중재자가 분쟁 금액을 업체 지급분과 고객 환불분으로 나눈다.
    /// @dev 두 금액의 합은 분쟁 대상 단계 금액과 정확히 일치해야 한다.
    function resolveDispute(
        uint256 agreementId,
        uint256 milestoneIndex,
        uint256 providerAmount,
        uint256 clientRefundAmount,
        bytes32 resolutionHash
    ) external {
        resolveDispute(agreementId, milestoneIndex, providerAmount, clientRefundAmount, resolutionHash, "");
    }

    function resolveDispute(
        uint256 agreementId,
        uint256 milestoneIndex,
        uint256 providerAmount,
        uint256 clientRefundAmount,
        bytes32 resolutionHash,
        string memory note
    ) public nonReentrant whenNotPaused {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.arbiter) revert NotArbiter();
        if (a.status != AgreementStatus.Disputed) revert InvalidAgreementStatus();

        Milestone storage m = _requireMilestone(agreementId, milestoneIndex);
        if (m.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();
        if (providerAmount + clientRefundAmount != m.amount) revert ResolutionAmountMismatch();

        m.status = MilestoneStatus.Resolved;
        m.responseHash = resolutionHash;
        m.resolvedAt = uint64(block.timestamp);

        a.totalReleased += providerAmount;
        a.totalRefunded += clientRefundAmount;

        _openDisputes[agreementId] -= 1;
        if (_openDisputes[agreementId] == 0) {
            a.status = AgreementStatus.Active;
        }

        if (providerAmount > 0) a.paymentToken.safeTransfer(a.provider, providerAmount);
        if (clientRefundAmount > 0) a.paymentToken.safeTransfer(a.client, clientRefundAmount);

        emit DisputeResolved(agreementId, milestoneIndex, providerAmount, clientRefundAmount, resolutionHash);
        _emitNote(agreementId, milestoneIndex, NoteKind.Resolution, note);

        if (_openDisputes[agreementId] == 0) _settleIfComplete(a, agreementId);
    }

    // ---------------------------------------------------------------------
    // 변경계약 (추가 작업)
    // ---------------------------------------------------------------------

    /// @notice 추가 작업을 변경계약으로 제안한다. 상대방이 승인해야 효력이 있다.
    /// @param additionalAmount 추가금. 0이면 기간·범위 변경 기록 용도로만 남는다.
    /// @param additionalDays 추가 소요 기간(일). 새 단계의 예정 완료일 계산에 쓴다.
    function proposeChangeOrder(
        uint256 agreementId,
        uint256 additionalAmount,
        uint64 additionalDays,
        bytes32 metadataHash,
        string calldata metadataURI
    ) external whenNotPaused returns (uint256 changeOrderId) {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();
        if (bytes(metadataURI).length > MAX_URI_LENGTH) revert StringTooLong();
        if (additionalAmount > 0) _requireRetentionUntouched(agreementId);

        ChangeOrder[] storage list = _changeOrders[agreementId];
        changeOrderId = list.length;

        list.push(
            ChangeOrder({
                id: changeOrderId,
                agreementId: agreementId,
                proposer: msg.sender,
                additionalAmount: additionalAmount,
                additionalDays: additionalDays,
                proposedAt: uint64(block.timestamp),
                status: ChangeOrderStatus.Proposed,
                metadataHash: metadataHash,
                metadataURI: metadataURI
            })
        );

        emit ChangeOrderProposed(agreementId, changeOrderId, msg.sender, additionalAmount);
    }

    /// @notice 제안하지 않은 상대방이 변경계약을 승인한다.
    function acceptChangeOrder(uint256 agreementId, uint256 changeOrderId) external whenNotPaused {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();

        ChangeOrder storage co = _requireChangeOrder(agreementId, changeOrderId);
        if (co.status != ChangeOrderStatus.Proposed) revert InvalidChangeOrderStatus();
        if (co.proposer == msg.sender) revert CannotAcceptOwnProposal();

        // 추가금이 없으면 옮길 자금이 없으므로 승인 즉시 확정된다.
        co.status = co.additionalAmount > 0 ? ChangeOrderStatus.Accepted : ChangeOrderStatus.Funded;

        emit ChangeOrderAccepted(agreementId, changeOrderId);
    }

    /// @notice 고객이 변경계약 추가금을 예치하면 새 단계가 열린다.
    function fundChangeOrder(uint256 agreementId, uint256 changeOrderId) external nonReentrant whenNotPaused {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client) revert NotClient();
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();

        ChangeOrder storage co = _requireChangeOrder(agreementId, changeOrderId);
        if (co.status != ChangeOrderStatus.Accepted) revert InvalidChangeOrderStatus();

        uint256 amount = co.additionalAmount;
        _requireRetentionUntouched(agreementId);
        _pullExact(a.paymentToken, amount);

        a.totalFunded += amount;
        co.status = ChangeOrderStatus.Funded;

        uint64 dueAt = uint64(block.timestamp) + uint64(co.additionalDays) * 1 days;
        uint256 index = _appendMilestone(agreementId, amount, dueAt, co.metadataHash);

        emit ChangeOrderFunded(agreementId, changeOrderId, amount);
        emit MilestoneAdded(agreementId, index, amount, dueAt);
    }

    // ---------------------------------------------------------------------
    // 상호 합의 취소
    // ---------------------------------------------------------------------

    /// @notice 고객 또는 업체가 계약 취소를 제안한다. 상대방 승인이 필요하다.
    function proposeCancellation(uint256 agreementId, bytes32 reasonHash) external {
        proposeCancellation(agreementId, reasonHash, "");
    }

    function proposeCancellation(uint256 agreementId, bytes32 reasonHash, string memory note) public {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        // 분쟁 중에는 중재 절차가 우선한다.
        if (a.status != AgreementStatus.Active) revert InvalidAgreementStatus();

        a.status = AgreementStatus.CancelPending;
        _cancelProposer[agreementId] = msg.sender;

        emit CancellationProposed(agreementId, msg.sender, reasonHash);
        _emitNote(agreementId, type(uint256).max, NoteKind.Cancellation, note);
    }

    /// @notice 계류 중인 취소 제안을 물린다. 계약은 다시 진행 중으로 돌아간다.
    /// @dev 제안자와 상대방 모두 호출할 수 있다. 취소 제안만으로 계약을 무기한
    ///      묶어두거나, 완료된 단계의 승인·분쟁 경로를 막지 못하게 하기 위함이다.
    function withdrawCancellation(uint256 agreementId) external {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        if (a.status != AgreementStatus.CancelPending) revert InvalidAgreementStatus();

        a.status = AgreementStatus.Active;
        delete _cancelProposer[agreementId];

        emit CancellationWithdrawn(agreementId, msg.sender);
    }

    /// @notice 상대방이 취소를 승인하면 미지급 잔액 전부가 고객에게 환불된다.
    /// @dev 이미 지급된 금액은 회수하지 않는다.
    function acceptCancellation(uint256 agreementId) external nonReentrant whenNotPaused {
        Agreement storage a = _requireAgreement(agreementId);
        if (msg.sender != a.client && msg.sender != a.provider) revert NotParty();
        if (a.status != AgreementStatus.CancelPending) revert InvalidAgreementStatus();
        if (_cancelProposer[agreementId] == msg.sender) revert SelfAcceptCancellation();

        uint256 refund = a.totalFunded - a.totalReleased - a.totalRefunded;
        a.totalRefunded += refund;
        a.status = AgreementStatus.Cancelled;

        if (refund > 0) a.paymentToken.safeTransfer(a.client, refund);

        emit AgreementCancelled(agreementId, refund);
    }

    // ---------------------------------------------------------------------
    // 관리자
    // ---------------------------------------------------------------------

    /// @notice 긴급 상황에서 신규 계약과 자금 이동을 멈춘다.
    /// @dev 관리자는 이 함수와 unpause 외에 어떤 자금도 움직일 수 없다.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // 조회
    // ---------------------------------------------------------------------

    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        return _requireAgreementView(agreementId);
    }

    function getMilestones(uint256 agreementId) external view returns (Milestone[] memory) {
        _requireAgreementView(agreementId);
        return _milestones[agreementId];
    }

    function getChangeOrders(uint256 agreementId) external view returns (ChangeOrder[] memory) {
        _requireAgreementView(agreementId);
        return _changeOrders[agreementId];
    }

    function getClientAgreementIds(address client) external view returns (uint256[] memory) {
        return _clientAgreements[client];
    }

    function getProviderAgreementIds(address provider) external view returns (uint256[] memory) {
        return _providerAgreements[provider];
    }

    function getArbiterAgreementIds(address arbiter) external view returns (uint256[] memory) {
        return _arbiterAgreements[arbiter];
    }

    /// @notice 해당 계약이 아직 컨트랙트에 잠가두고 있는 금액
    function escrowBalance(uint256 agreementId) public view returns (uint256) {
        Agreement storage a = _requireAgreementView(agreementId);
        return a.totalFunded - a.totalReleased - a.totalRefunded;
    }

    function openDisputeCount(uint256 agreementId) external view returns (uint256) {
        return _openDisputes[agreementId];
    }

    function cancellationProposer(uint256 agreementId) external view returns (address) {
        return _cancelProposer[agreementId];
    }

    /// @notice 지금 행동해야 할 단계의 인덱스. 모두 정산되었으면 단계 수와 같다.
    function firstUnsettledMilestone(uint256 agreementId) external view returns (uint256) {
        return _firstUnsettled(agreementId);
    }

    // ---------------------------------------------------------------------
    // 내부 helper
    // ---------------------------------------------------------------------

    /// @dev 수수료 부과형 토큰이 섞이면 계약별 회계가 깨지므로 실제 증가분이
    ///      요청 금액과 정확히 같은지 확인한다.
    function _pullExact(IERC20 token, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert FundingAmountMismatch();
    }

    function _payMilestone(Agreement storage a, Milestone storage m, uint256 agreementId, uint256 milestoneIndex)
        private
    {
        uint256 amount = m.amount;
        m.status = MilestoneStatus.Paid;
        m.resolvedAt = uint64(block.timestamp);
        a.totalReleased += amount;

        a.paymentToken.safeTransfer(a.provider, amount);

        emit MilestonePaid(agreementId, milestoneIndex, a.provider, amount);
    }

    function _settleIfComplete(Agreement storage a, uint256 agreementId) private {
        if (_openDisputes[agreementId] != 0) return;
        if (_firstUnsettled(agreementId) != _milestones[agreementId].length) return;

        a.status = AgreementStatus.Completed;
        emit AgreementCompleted(agreementId);
    }

    function _firstUnsettled(uint256 agreementId) private view returns (uint256) {
        Milestone[] storage list = _milestones[agreementId];
        uint256 len = list.length;
        for (uint256 i = 0; i < len; ++i) {
            MilestoneStatus s = list[i].status;
            if (s != MilestoneStatus.Paid && s != MilestoneStatus.Resolved) return i;
        }
        return len;
    }

    /// @dev 하자보증금은 언제나 마지막 단계여야 한다. 변경계약으로 생긴 단계는
    ///      하자보증금 앞에 끼워 넣어 순서를 유지한다.
    function _appendMilestone(uint256 agreementId, uint256 amount, uint64 dueAt, bytes32 titleHash)
        private
        returns (uint256 index)
    {
        Milestone[] storage list = _milestones[agreementId];
        uint256 len = list.length;
        if (len >= MAX_TOTAL_MILESTONES) revert TooManyMilestones();

        Milestone memory added = Milestone({
            amount: amount,
            dueAt: dueAt,
            retentionReleaseAt: 0,
            isRetention: false,
            status: MilestoneStatus.Pending,
            titleHash: titleHash,
            evidenceHash: bytes32(0),
            responseHash: bytes32(0),
            submittedAt: 0,
            resolvedAt: 0
        });

        if (len > 0 && list[len - 1].isRetention) {
            list.push(list[len - 1]);
            index = len - 1;
            list[index] = added;
        } else {
            list.push(added);
            index = len;
        }
    }

    /// @dev 하자보증금 단계가 이미 진행 중이면 순서를 바꿀 수 없으므로 막는다.
    function _requireRetentionUntouched(uint256 agreementId) private view {
        Milestone[] storage list = _milestones[agreementId];
        uint256 len = list.length;
        if (len == 0) return;

        Milestone storage last = list[len - 1];
        if (last.isRetention && last.status != MilestoneStatus.Pending) revert RetentionAlreadyStarted();
    }

    function _emitNote(uint256 agreementId, uint256 milestoneIndex, NoteKind kind, string memory note) private {
        if (bytes(note).length == 0) return;
        if (bytes(note).length > MAX_NOTE_LENGTH) revert StringTooLong();
        emit MilestoneNote(agreementId, milestoneIndex, msg.sender, kind, note);
    }

    function _requireAgreement(uint256 agreementId) private view returns (Agreement storage a) {
        if (agreementId >= agreementCount) revert UnknownAgreement();
        a = _agreements[agreementId];
    }

    function _requireAgreementView(uint256 agreementId) private view returns (Agreement storage a) {
        if (agreementId >= agreementCount) revert UnknownAgreement();
        a = _agreements[agreementId];
    }

    function _requireMilestone(uint256 agreementId, uint256 milestoneIndex) private view returns (Milestone storage) {
        Milestone[] storage list = _milestones[agreementId];
        if (milestoneIndex >= list.length) revert MilestoneOutOfRange();
        return list[milestoneIndex];
    }

    function _requireChangeOrder(uint256 agreementId, uint256 changeOrderId)
        private
        view
        returns (ChangeOrder storage)
    {
        ChangeOrder[] storage list = _changeOrders[agreementId];
        if (changeOrderId >= list.length) revert UnknownChangeOrder();
        return list[changeOrderId];
    }
}
