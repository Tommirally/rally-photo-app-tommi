import { describe, expect, it } from "vitest";
import { generatePassword, isValidEmail } from "./password";

describe("generatePassword", () => {
  it("is 14 readable characters and different each time", () => {
    const a = generatePassword();
    expect(a).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{14}$/);
    expect(generatePassword()).not.toBe(a);
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses and rejects junk", () => {
    expect(isValidEmail("photo@example.co.uk")).toBe(true);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("a b@c.d")).toBe(false);
  });
});
