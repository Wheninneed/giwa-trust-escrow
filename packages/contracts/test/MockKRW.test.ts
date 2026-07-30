import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expectRevert, mKRW, setup } from "./helpers.js";

describe("MockKRW", () => {
  it("이름·심볼·소수점 자리가 원화 표기를 따른다", async () => {
    const { token } = await setup();
    assert.equal(await token.read.name(), "Mock Korean Won");
    assert.equal(await token.read.symbol(), "mKRW");
    assert.equal(await token.read.decimals(), 6);
  });

  it("배포자가 초기 물량을 받는다", async () => {
    const { token, admin } = await setup();
    const initial = await token.read.INITIAL_SUPPLY();
    // 고객 배분분을 빼고도 초기 물량이 배포자에게 남아 있다
    assert.equal(await token.read.balanceOf([admin.account.address]), initial);
  });

  it("faucet 이 정해진 수량을 발행한다", async () => {
    const { token, outsider } = await setup();
    await token.write.faucet({ account: outsider.account });
    assert.equal(await token.read.balanceOf([outsider.account.address]), await token.read.FAUCET_AMOUNT());
  });

  it("쿨다운 안에서 다시 호출하면 되돌린다", async () => {
    const { token, outsider } = await setup();
    await token.write.faucet({ account: outsider.account });
    await expectRevert(token.write.faucet({ account: outsider.account }), "FaucetCooldownNotElapsed");
  });

  it("쿨다운이 지나면 다시 받을 수 있다", async () => {
    const { token, outsider, networkHelpers } = await setup();
    await token.write.faucet({ account: outsider.account });
    await networkHelpers.time.increase(Number(await token.read.FAUCET_COOLDOWN()));
    await token.write.faucet({ account: outsider.account });

    const amount = await token.read.FAUCET_AMOUNT();
    assert.equal(await token.read.balanceOf([outsider.account.address]), amount * 2n);
  });

  it("mintTo 는 관리자만 호출할 수 있다", async () => {
    const { token, outsider } = await setup();
    await expectRevert(
      token.write.mintTo([outsider.account.address, mKRW("1")], { account: outsider.account }),
      "OwnableUnauthorizedAccount",
    );
  });
});
