import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGameAddress } from "../client/js/network.js";
const page = { origin: "http://localhost:3000", protocol: "http:" };
test("endereços completos preservam portas; IP simples usa 3000", () => {
  for (const [input, expected] of [
    ["", page.origin],
    ["192.168.1.5", "http://192.168.1.5:3000"],
    ["localhost", "http://localhost:3000"],
    ["192.168.1.5:80", "http://192.168.1.5"],
    ["http://example.test:80", "http://example.test"],
    ["http://example.test", "http://example.test"],
    ["http://example.test:3001", "http://example.test:3001"],
    ["https://example.test:443", "https://example.test"],
    ["https://example.test:8443", "https://example.test:8443"],
    ["[::1]", "http://[::1]:3000"],
    ["[::1]:3001", "http://[::1]:3001"],
  ]) assert.equal(resolveGameAddress(input, page), expected, input);
});
test("recusa credenciais, protocolos inválidos e conteúdo misto", () => {
  for (const input of ["ftp://example.test", "http://user:pass@example.test", "http://"])
    assert.throws(() => resolveGameAddress(input, page));
  assert.throws(() => resolveGameAddress("192.168.1.5", {
    origin: "https://example.test", protocol: "https:",
  }), /HTTPS/);
});
