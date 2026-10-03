import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createNonce, linkWallet, NONCE_TTL_MS } from "../src/auth/wallet";
import { makeUser } from "./helpers";

describe("wallet binding", () => {
  it("links a wallet with a valid signature", async () => {
    const user = await makeUser();
    const acct = privateKeyToAccount(generatePrivateKey());
    const { nonce, message } = await createNonce(user, acct.address);
    expect(message).toContain(`@${user.githubHandle}`);
    expect(message).toContain(acct.address);
    const signature = await acct.signMessage({ message });
    const u = await linkWallet(user, { nonce, address: acct.address, signature });
    expect(u.walletAddress).toBe(acct.address.toLowerCase());
  });

  it("rejects a replayed signature", async () => {
    const user = await makeUser();
    const acct = privateKeyToAccount(generatePrivateKey());
    const { nonce, message } = await createNonce(user, acct.address);
    const signature = await acct.signMessage({ message });
    await linkWallet(user, { nonce, address: acct.address, signature });
    await expect(linkWallet(user, { nonce, address: acct.address, signature })).rejects.toThrow(/already used/);
  });

  it("rejects an expired nonce", async () => {
    const user = await makeUser();
    const acct = privateKeyToAccount(generatePrivateKey());
    const { nonce, message } = await createNonce(user, acct.address);
    const signature = await acct.signMessage({ message });
    const later = new Date(Date.now() + NONCE_TTL_MS + 1000);
    await expect(linkWallet(user, { nonce, address: acct.address, signature }, later)).rejects.toThrow(/expired/);
  });

  it("rejects a wrong signer", async () => {
    const user = await makeUser();
    const acct = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const { nonce, message } = await createNonce(user, acct.address);
    const signature = await attacker.signMessage({ message });
    await expect(linkWallet(user, { nonce, address: acct.address, signature })).rejects.toThrow(/Signature/);
  });

  it("rejects a nonce issued to another user", async () => {
    const alice = await makeUser();
    const mallory = await makeUser();
    const acct = privateKeyToAccount(generatePrivateKey());
    const { nonce, message } = await createNonce(alice, acct.address);
    const signature = await acct.signMessage({ message });
    await expect(linkWallet(mallory, { nonce, address: acct.address, signature })).rejects.toThrow(/Nonce/);
  });

  it("rejects a wallet already linked to someone else", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const a = await makeUser();
    const n1 = await createNonce(a, acct.address);
    await linkWallet(a, { nonce: n1.nonce, address: acct.address, signature: await acct.signMessage({ message: n1.message }) });
    const b = await makeUser();
    const n2 = await createNonce(b, acct.address);
    await expect(
      linkWallet(b, { nonce: n2.nonce, address: acct.address, signature: await acct.signMessage({ message: n2.message }) }),
    ).rejects.toThrow(/another account/);
  });
});
