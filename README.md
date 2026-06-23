# Decentralized Escrow System

A secure, multi-party escrow smart contract system for trustless transactions on EVM-compatible chains (Ethereum, Polygon, Arbitrum, Optimism).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  DecentralizedEscrow                  │
├─────────────────────────────────────────────────────┤
│  - Escrow creation & management                      │
│  - Multi-token support (ETH + ERC-20)               │
│  - Dispute resolution with arbiter                  │
│  - Fee collection & admin functions                 │
└─────────────────────────────────────────────────────┘
```

## Smart Contract

### `DecentralizedEscrow.sol`

The main contract handles all escrow operations:

| Feature | Description |
|---------|-------------|
| **Escrow Creation** | Buyers create escrows locking funds until conditions met |
| **Multi-token Support** | Native ETH and any ERC-20 token |
| **Multi-sig Release** | Requires both buyer/seller confirmation OR arbiter decision |
| **Dispute Resolution** | 3-party mechanism (buyer, seller, arbiter) |
| **Timeout Refund** | Auto-refund after expiration |
| **Fee Structure** | 0.5%-2% configurable fee on successful transactions |
| **Arbiter Registry** | Whitelist of approved arbiters with reputation scores |
| **Batch Operations** | Create and deposit to multiple escrows in one tx |
| **Emergency Pause** | Admin can pause contract during incidents |

### State Machine

```
Pending → Funded → Completed  (both confirm or arbiter resolves)
Pending → Funded → Disputed → Completed  (arbiter favors seller)
Pending → Funded → Disputed → Refunded   (arbiter favors buyer)
Pending → Funded → Refunded  (timeout expired)
Pending → Completed  (both confirm before deposit)
```

### Escrow Status Enum

- `0 - Pending`: Created, awaiting deposit
- `1 - Funded`: Funds locked in contract
- `2 - Completed`: Funds released to seller
- `3 - Disputed`: Dispute opened, awaiting arbiter
- `4 - Refunded`: Funds returned to buyer

## Deployment

### Prerequisites

```bash
npm install
cp .env.example .env
# Fill in PRIVATE_KEY and RPC URLs
```

### Local

```bash
npx hardhat node &
npx hardhat run scripts/deploy.js --network localhost
```

### Testnets / Mainnets

```bash
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat run scripts/deploy.js --network polygon
npx hardhat run scripts/deploy.js --network arbitrum
npx hardhat run scripts/deploy.js --network optimism
```

### Constructor Parameters

| Param | Type | Description |
|-------|------|-------------|
| `_admin` | address | Admin address for privileged functions |
| `_treasury` | address | Fee recipient address |
| `_defaultFeePercent` | uint256 | Default fee in basis points (100 = 1%) |

## Testing

```bash
npx hardhat test
npx hardhat coverage
REPORT_GAS=true npx hardhat test  # gas reporter
```

### Test Coverage

- **Unit Tests** (39+): All core functions, access control, edge cases
- **Scenarios tested**:
  - ETH and ERC-20 deposits
  - Multi-sig confirmation flow
  - Dispute opening and resolution (both outcomes)
  - Timeout refund mechanism
  - Batch create and batch deposit
  - Emergency pause and withdraw
  - Arbiter whitelist management
  - Access control enforcement
  - Reentrancy protection
  - Dispute cooldown enforcement

## Security

### Measures Implemented

- **Reentrancy Guards**: OpenZeppelin's `ReentrancyGuard` on all fund-moving functions
- **Checks-Effects-Interactions**: State updates before external calls
- **SafeERC20**: All ERC-20 transfers use OpenZeppelin's safe wrappers
- **Input Validation**: Zero-address checks, amount > 0, duration bounds
- **Access Control**: Role-based modifiers (admin, buyer, seller, arbiter)
- **Rate Limiting**: 24-hour dispute cooldown, max 3 disputes per escrow
- **Emergency Pause**: Admin can halt all non-admin operations
- **Overflow Protection**: Solidity 0.8+ built-in overflow checking

### Audit Checklist

- [x] Reentrancy (L2)
- [x] Arithmetic overflow/underflow (L0)
- [x] Access control (L2)
- [x] Front-running (L1)
- [x] Timestamp dependence (L1)
- [x] Gas limits (L0)
- [x] Phishing with tx origin (L0)
- [x] Logic correctness (L2)

## Frontend Integration

### Quick Start

```javascript
import { ethers } from "ethers";
import EscrowSDK from "./frontend/EscrowSDK.js";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const sdk = new EscrowSDK("0xYourContractAddress", signer);

// Create an escrow
const { escrowId } = await sdk.createEscrow(
  sellerAddress,
  arbiterAddress,
  ethers.ZeroAddress, // ETH
  ethers.parseEther("10"),
  Math.floor(Date.now() / 1000) + 86400, // 24h expiry
  100 // 1% fee
);

// Deposit funds
await sdk.deposit(escrowId, ethers.parseEther("10"));

// Listen for events
sdk.onEscrowCompleted((data) => {
  console.log(`Escrow ${data.escrowId} completed!`);
});
```

### Event Reference

| Event | Emitted When | Data |
|-------|-------------|------|
| `EscrowCreated` | New escrow created | escrowId, buyer, seller, arbiter, token, amount, expiration, feePercent |
| `FundsDeposited` | Funds deposited | escrowId, depositor, amount |
| `BuyerConfirmed` | Buyer confirms | escrowId |
| `SellerConfirmed` | Seller confirms | escrowId |
| `EscrowCompleted` | Funds released | escrowId, token, amount, fee |
| `DisputeOpened` | Dispute opened | escrowId, opener |
| `DisputeResolved` | Arbiter resolves | escrowId, status, resolver |
| `EscrowRefunded` | Funds refunded | escrowId, amount |

## Gas Optimization

- Use batch operations for multiple escrows
- Use ETH instead of ERC-20 when possible (cheaper transfers)
- Default fee is stored once, not per-escrow (unless overridden)

## License

MIT
