import { describe, expect, it } from "vitest";
import {
  currencySymbolFor,
  formatNumberValue,
  progressPercent,
} from "./number-format";

describe("formatNumberValue", () => {
  it("formats plain numbers with comma/period by default", () => {
    expect(formatNumberValue(1234.5)).toBe("1,234.5");
    expect(formatNumberValue(-1234567)).toBe("-1,234,567");
    expect(formatNumberValue(0.1 + 0.2)).toBe("0.3");
    expect(formatNumberValue(0)).toBe("0");
  });

  it("applies precision", () => {
    expect(formatNumberValue(3.14159, { precision: 2 })).toBe("3.14");
    expect(formatNumberValue(3, { precision: 2 })).toBe("3.00");
    expect(formatNumberValue(2.5, { precision: 0 })).toBe("3");
    expect(formatNumberValue(-0.001, { precision: 1 })).toBe("0.0");
  });

  it.each([
    ["none", "1234567.5"],
    ["comma_period", "1,234,567.5"],
    ["period_comma", "1.234.567,5"],
    ["space_comma", "1\u00a0234\u00a0567,5"],
    ["space_period", "1\u00a0234\u00a0567.5"],
  ] as const)("separators %s", (separators, expected) => {
    expect(formatNumberValue(1234567.5, { separators })).toBe(expected);
  });

  it("uses the UI locale for local separators", () => {
    expect(formatNumberValue(1234.5, { separators: "local" }, "de-DE")).toBe("1.234,5");
    expect(formatNumberValue(1234.5, { separators: "local" }, "en-US")).toBe("1,234.5");
  });

  it("formats currency with symbol or code", () => {
    expect(formatNumberValue(1234.5, { format: "currency" })).toBe("$1,234.50");
    expect(
      formatNumberValue(-12, { format: "currency", currencyCode: "EUR" }, "en-US"),
    ).toBe("-€12.00");
    expect(
      formatNumberValue(5, { format: "currency", currencySymbol: "₫", precision: 0 }),
    ).toBe("₫5");
    expect(currencySymbolFor("NOT-A-CODE")).toBe("NOT-A-CODE");
  });

  it("formats percent and progress on the percentage scale", () => {
    expect(formatNumberValue(42, { format: "percent" })).toBe("42%");
    expect(formatNumberValue(12.345, { format: "percent", precision: 1 })).toBe("12.3%");
    expect(formatNumberValue(80, { format: "progress" })).toBe("80%");
  });

  it("returns empty text for non numbers", () => {
    expect(formatNumberValue(null)).toBe("");
    expect(formatNumberValue("12")).toBe("");
    expect(formatNumberValue(NaN)).toBe("");
    expect(formatNumberValue(Infinity)).toBe("");
  });
});

describe("progressPercent", () => {
  it("clamps to 0-100", () => {
    expect(progressPercent(50)).toBe(50);
    expect(progressPercent(150)).toBe(100);
    expect(progressPercent(-5)).toBe(0);
    expect(progressPercent(null)).toBe(0);
  });
});
