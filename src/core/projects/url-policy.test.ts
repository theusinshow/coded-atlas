import { describe, expect, it } from "vitest";
import { classifyAddress, evaluateUrl } from "./url-policy";

describe("classifyAddress", () => {
  it.each([
    ["8.8.8.8", "public"],
    ["1.1.1.1", "public"],
    ["127.0.0.1", "loopback"],
    ["127.10.20.30", "loopback"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["172.32.0.1", "public"],
    ["192.168.1.10", "private"],
    ["100.64.0.1", "private"],
    ["169.254.10.10", "link-local"],
    ["169.254.169.254", "metadata"],
    ["0.0.0.0", "unspecified"],
    ["224.0.0.1", "reserved"],
    ["255.255.255.255", "reserved"],
    ["::1", "loopback"],
    ["[::1]", "loopback"],
    ["::", "unspecified"],
    ["fc00::1", "private"],
    ["fd12:3456::1", "private"],
    ["fe80::1%eth0", "link-local"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:10.0.0.1", "private"],
    ["::ffff:8.8.8.8", "public"],
    ["fd00:ec2::254", "metadata"],
    ["2606:4700:4700::1111", "public"],
    ["2001:db8::1", "reserved"],
    ["ff02::1", "reserved"],
    ["256.1.1.1", "invalid"],
    ["exemplo.com", "invalid"],
    ["1::2::3", "invalid"],
  ])("%s → %s", (ip, expected) => {
    expect(classifyAddress(ip)).toBe(expected);
  });
});

describe("evaluateUrl", () => {
  it("modo local: aceita localhost e rede interna, exige http(s)", () => {
    expect(evaluateUrl("http://localhost:3000", "local")).toEqual({ allowed: true });
    expect(evaluateUrl("http://192.168.0.10/app", "local")).toEqual({ allowed: true });
    expect(evaluateUrl("file:///etc/passwd", "local").allowed).toBe(false);
    expect(evaluateUrl("javascript:alert(1)", "local").allowed).toBe(false);
    expect(evaluateUrl("não é url", "local").allowed).toBe(false);
    expect(evaluateUrl("https://user:senha@site.com", "local").allowed).toBe(false);
  });

  it.each([
    "http://localhost",
    "http://app.localhost",
    "http://printer.local",
    "http://metadata.google.internal",
    "http://127.0.0.1:5000",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.1.2.3",
    "http://0.0.0.0",
  ])("hosted-safe bloqueia %s", (url) => {
    expect(evaluateUrl(url, "hosted-safe").allowed).toBe(false);
  });

  it("hosted-safe decide pelos endereços resolvidos — um privado basta para bloquear", () => {
    expect(evaluateUrl("https://site.com", "hosted-safe", ["93.184.216.34"])).toEqual({ allowed: true });
    expect(evaluateUrl("https://site.com", "hosted-safe", ["93.184.216.34", "10.0.0.1"]).allowed).toBe(false);
    expect(evaluateUrl("https://rebind.example", "hosted-safe", ["127.0.0.1"]).allowed).toBe(false);
    expect(evaluateUrl("https://nao-resolve.example", "hosted-safe", []).allowed).toBe(false);
    expect(evaluateUrl("https://8.8.8.8/", "hosted-safe")).toEqual({ allowed: true });
  });
});
