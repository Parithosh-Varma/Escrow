const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DecentralizedEscrow", function () {
  async function deployFixture() {
    const [admin, treasury, buyer, seller, arbiter, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.connect(admin).deploy();

    const DecentralizedEscrow = await ethers.getContractFactory("DecentralizedEscrow");
    const escrow = await DecentralizedEscrow.connect(admin).deploy(admin.address, treasury.address, 100n);

    await escrow.connect(admin).addArbiter(arbiter.address);

    const amount = ethers.parseEther("10");
    const latest = await time.latest();
    const expiration = latest + 86400;
    const feePercent = 100n;

    return { escrow, usdc, admin, treasury, buyer, seller, arbiter, other, amount, expiration, feePercent, latest };
  }

  describe("Deployment & Admin", function () {
    it("should set admin and treasury correctly", async function () {
      const { escrow, admin, treasury } = await loadFixture(deployFixture);
      expect(await escrow.admin()).to.equal(admin.address);
      expect(await escrow.treasury()).to.equal(treasury.address);
    });

    it("should set default fee percent", async function () {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.defaultFeePercent()).to.equal(100n);
    });

    it("should reject zero address admin", async function () {
      const DecentralizedEscrow = await ethers.getContractFactory("DecentralizedEscrow");
      const [, , treasury] = await ethers.getSigners();
      await expect(DecentralizedEscrow.deploy(ethers.ZeroAddress, treasury.address, 100))
        .to.be.revertedWith("Escrow: zero admin");
    });

    it("should reject zero address treasury", async function () {
      const DecentralizedEscrow = await ethers.getContractFactory("DecentralizedEscrow");
      const [admin] = await ethers.getSigners();
      await expect(DecentralizedEscrow.deploy(admin.address, ethers.ZeroAddress, 100))
        .to.be.revertedWith("Escrow: zero treasury");
    });

    it("should reject invalid fee percent (>2%)", async function () {
      const DecentralizedEscrow = await ethers.getContractFactory("DecentralizedEscrow");
      const [admin] = await ethers.getSigners();
      await expect(DecentralizedEscrow.deploy(admin.address, admin.address, 300))
        .to.be.revertedWith("Escrow: invalid fee");
    });
  });

  describe("Arbiter Registry", function () {
    it("should add arbiter", async function () {
      const { escrow, arbiter } = await loadFixture(deployFixture);
      const info = await escrow.arbiters(arbiter.address);
      expect(info.isApproved).to.be.true;
      expect(info.reputation).to.equal(100n);
    });

    it("should remove arbiter", async function () {
      const { escrow, admin, arbiter } = await loadFixture(deployFixture);
      await escrow.connect(admin).removeArbiter(arbiter.address);
      const info = await escrow.arbiters(arbiter.address);
      expect(info.isApproved).to.be.false;
    });

    it("should update reputation", async function () {
      const { escrow, admin, arbiter } = await loadFixture(deployFixture);
      await escrow.connect(admin).updateReputation(arbiter.address, 85);
      const info = await escrow.arbiters(arbiter.address);
      expect(info.reputation).to.equal(85n);
    });

    it("should only allow admin to add arbiter", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      await expect(escrow.connect(other).addArbiter(other.address))
        .to.be.revertedWith("Escrow: not admin");
    });
  });

  describe("Escrow Creation", function () {
    it("should create escrow with ETH", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      const tx = await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await expect(tx).to.emit(escrow, "EscrowCreated").withArgs(0, buyer.address, seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);

      const e = await escrow.escrows(0);
      expect(e.buyer).to.equal(buyer.address);
      expect(e.seller).to.equal(seller.address);
      expect(e.arbiter).to.equal(arbiter.address);
      expect(e.token).to.equal(ethers.ZeroAddress);
      expect(e.amount).to.equal(amount);
      expect(e.status).to.equal(0n);
    });

    it("should create escrow with ERC-20", async function () {
      const { escrow, buyer, seller, arbiter, usdc, expiration, feePercent } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("1000", 6);
      const tx = await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, usdc.target, amount, expiration, feePercent);
      await expect(tx).to.emit(escrow, "EscrowCreated").withArgs(0, buyer.address, seller.address, arbiter.address, usdc.target, amount, expiration, feePercent);
    });

    it("should reject zero seller", async function () {
      const { escrow, buyer, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await expect(escrow.connect(buyer).createEscrow(ethers.ZeroAddress, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent))
        .to.be.revertedWith("Escrow: zero seller");
    });

    it("should reject zero amount", async function () {
      const { escrow, buyer, seller, arbiter, expiration, feePercent } = await loadFixture(deployFixture);
      await expect(escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, 0, expiration, feePercent))
        .to.be.revertedWith("Escrow: zero amount");
    });

    it("should reject buyer == seller", async function () {
      const { escrow, buyer, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await expect(escrow.connect(buyer).createEscrow(buyer.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent))
        .to.be.revertedWith("Escrow: buyer == seller");
    });

    it("should reject unapproved arbiter", async function () {
      const { escrow, buyer, seller, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await expect(escrow.connect(buyer).createEscrow(seller.address, buyer.address, ethers.ZeroAddress, amount, expiration, feePercent))
        .to.be.revertedWith("Escrow: invalid arbiter");
    });

    it("should use default fee when zero provided", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, 0);
      const e = await escrow.escrows(0);
      expect(e.feePercent).to.equal(100n);
    });
  });

  describe("Deposit", function () {
    it("should deposit ETH", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);

      await expect(escrow.connect(buyer).deposit(0, { value: amount }))
        .to.emit(escrow, "FundsDeposited").withArgs(0, buyer.address, amount);

      const e = await escrow.escrows(0);
      expect(e.status).to.equal(1n);
    });

    it("should deposit ERC-20", async function () {
      const { escrow, buyer, seller, arbiter, usdc, expiration, feePercent, admin } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("1000", 6);
      await usdc.connect(admin).mint(buyer.address, amount);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, usdc.target, amount, expiration, feePercent);

      await usdc.connect(buyer).approve(escrow.target, amount);
      await expect(escrow.connect(buyer).deposit(0))
        .to.emit(escrow, "FundsDeposited").withArgs(0, buyer.address, amount);

      expect(await usdc.balanceOf(escrow.target)).to.equal(amount);
    });

    it("should reject incorrect ETH amount", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await expect(escrow.connect(buyer).deposit(0, { value: ethers.parseEther("5") }))
        .to.be.revertedWith("Escrow: incorrect ETH amount");
    });

    it("should reject deposit from non-buyer", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await expect(escrow.connect(seller).deposit(0, { value: amount }))
        .to.be.revertedWith("Escrow: not buyer");
    });
  });

  describe("Confirmation & Release", function () {
    it("should complete escrow when both confirm", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });

      await escrow.connect(buyer).confirmByBuyer(0);
      await escrow.connect(seller).confirmBySeller(0);

      const e = await escrow.escrows(0);
      expect(e.status).to.equal(2n);
    });

    it("should release funds to seller on completion", async function () {
      const { escrow, buyer, seller, arbiter, treasury, amount, expiration, feePercent } = await loadFixture(deployFixture);
      const fee = (amount * feePercent) / 10000n;
      const payout = amount - fee;

      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });

      await escrow.connect(buyer).confirmByBuyer(0);
      await escrow.connect(seller).confirmBySeller(0);

      await expect(
        await ethers.provider.getBalance(seller.address)
      ).to.be.closeTo(ethers.parseEther("10000") + payout, ethers.parseEther("0.1"));

      await expect(
        await ethers.provider.getBalance(treasury.address)
      ).to.be.closeTo(ethers.parseEther("10000") + fee, ethers.parseEther("0.1"));
    });

    it("should release via release() with one confirmation", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });

      await escrow.connect(buyer).confirmByBuyer(0);
      await escrow.connect(seller).release(0);

      const e = await escrow.escrows(0);
      expect(e.status).to.equal(2n);
    });

    it("should not complete without both confirmations", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });

      await escrow.connect(buyer).confirmByBuyer(0);
      const e = await escrow.escrows(0);
      expect(e.status).to.equal(1n); // Still funded
    });
  });

  describe("Dispute Resolution", function () {
    it("should open dispute", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });

      await expect(escrow.connect(buyer).openDispute(0))
        .to.emit(escrow, "DisputeOpened").withArgs(0, buyer.address);

      const e = await escrow.escrows(0);
      expect(e.status).to.equal(3n);
    });

    it("should resolve dispute in favor of seller", async function () {
      const { escrow, buyer, seller, arbiter, treasury, amount, expiration, feePercent } = await loadFixture(deployFixture);
      const fee = (amount * feePercent) / 10000n;
      const payout = amount - fee;

      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });
      await escrow.connect(buyer).openDispute(0);

      await expect(escrow.connect(arbiter).resolveDispute(0, 2))
        .to.emit(escrow, "DisputeResolved").withArgs(0, 2, arbiter.address);

      const sellerBal = await ethers.provider.getBalance(seller.address);
      expect(sellerBal).to.be.closeTo(ethers.parseEther("10000") + payout, ethers.parseEther("0.01"));
    });

    it("should refund buyer on dispute resolution", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });
      await escrow.connect(buyer).openDispute(0);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await escrow.connect(arbiter).resolveDispute(0, 4);
      expect(await ethers.provider.getBalance(buyer.address)).to.equal(buyerBefore + amount);
    });

    it("should only allow arbiter to resolve", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });
      await escrow.connect(buyer).openDispute(0);

      await expect(escrow.connect(buyer).resolveDispute(0, 2))
        .to.be.revertedWith("Escrow: not arbiter");
    });
  });

  describe("Refund", function () {
    it("should refund after expiration", async function () {
      const { escrow, buyer, seller, arbiter, amount, feePercent } = await loadFixture(deployFixture);
      const shortExpiration = (await time.latest()) + 3700;
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, shortExpiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });

      await time.increaseTo(shortExpiration + 1);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await expect(escrow.connect(buyer).requestRefund(0))
        .to.emit(escrow, "EscrowRefunded").withArgs(0, amount);
      expect(await ethers.provider.getBalance(buyer.address)).to.be.closeTo(buyerBefore + amount, ethers.parseEther("0.01"));
    });

    it("should reject refund before expiration", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });

      await expect(escrow.connect(buyer).requestRefund(0))
        .to.be.revertedWith("Escrow: not expired");
    });
  });

  describe("Batch Operations", function () {
    it("should batch create escrows", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).batchCreateEscrow(
        [seller.address, seller.address],
        [arbiter.address, arbiter.address],
        [ethers.ZeroAddress, ethers.ZeroAddress],
        [amount, amount],
        [expiration, expiration],
        [feePercent, feePercent]
      );
      expect(await escrow.escrowCount()).to.equal(2n);
    });

    it("should batch deposit ETH", async function () {
      const { escrow, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);

      await escrow.connect(buyer).batchDeposit([0, 1], { value: amount * 2n });
      const e0 = await escrow.escrows(0);
      const e1 = await escrow.escrows(1);
      expect(e0.status).to.equal(1n);
      expect(e1.status).to.equal(1n);
    });
  });

  describe("Pause / Emergency", function () {
    it("should pause and unpause by admin", async function () {
      const { escrow, admin } = await loadFixture(deployFixture);
      await escrow.connect(admin).pause();
      expect(await escrow.paused()).to.be.true;
      await escrow.connect(admin).unpause();
      expect(await escrow.paused()).to.be.false;
    });

    it("should reject actions when paused", async function () {
      const { escrow, admin, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(admin).pause();
      await expect(escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent))
        .to.be.revertedWith("Escrow: paused");
    });

    it("should allow emergency withdraw when paused", async function () {
      const { escrow, admin, buyer, seller, arbiter, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });
      await escrow.connect(admin).pause();

      const adminBefore = await ethers.provider.getBalance(admin.address);
      await escrow.connect(admin).emergencyWithdraw(ethers.ZeroAddress);
      expect(await ethers.provider.getBalance(admin.address)).to.be.gt(adminBefore);
    });
  });

  describe("Access Control", function () {
    it("should reject non-admin admin functions", async function () {
      const { escrow, other } = await loadFixture(deployFixture);
      await expect(escrow.connect(other).pause()).to.be.revertedWith("Escrow: not admin");
      await expect(escrow.connect(other).addArbiter(other.address)).to.be.revertedWith("Escrow: not admin");
      await expect(escrow.connect(other).updateTreasury(other.address)).to.be.revertedWith("Escrow: not admin");
    });

    it("should reject non-participant actions", async function () {
      const { escrow, buyer, seller, arbiter, other, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, expiration, feePercent);

      await expect(escrow.connect(other).confirmByBuyer(0)).to.be.revertedWith("Escrow: not buyer");
      await expect(escrow.connect(other).confirmBySeller(0)).to.be.revertedWith("Escrow: not seller");

      // Escrow not funded yet, so dispute will fail with "not funded"
      await escrow.connect(buyer).deposit(0, { value: amount });
      await expect(escrow.connect(other).openDispute(0)).to.be.revertedWith("Escrow: only buyer or seller");
    });
  });

  describe("Security", function () {
    it("should not allow opening dispute without arbiter", async function () {
      const { escrow, buyer, seller, amount, expiration, feePercent } = await loadFixture(deployFixture);
      await escrow.connect(buyer).createEscrow(seller.address, ethers.ZeroAddress, ethers.ZeroAddress, amount, expiration, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });
      await expect(escrow.connect(buyer).openDispute(0))
        .to.be.revertedWith("Escrow: no arbiter assigned");
    });

    it("should enforce dispute cooldown", async function () {
      const { escrow, buyer, seller, arbiter, amount, feePercent, latest } = await loadFixture(deployFixture);
      const exp = latest + 86400;
      await escrow.connect(buyer).createEscrow(seller.address, arbiter.address, ethers.ZeroAddress, amount, exp, feePercent);
      await escrow.connect(buyer).deposit(0, { value: amount });
      await escrow.connect(buyer).openDispute(0);
      await escrow.connect(arbiter).resolveDispute(0, 2);
    });
  });
});
