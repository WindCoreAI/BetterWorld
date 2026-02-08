import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadSigningKeyPair,
  signPayload,
  verifySignature,
  getKeyId,
} from "../crypto";
import { generateKeyPairSync } from "crypto";

describe("Crypto Utilities", () => {
  let originalPrivateKey: string | undefined;
  let originalPublicKey: string | undefined;

  beforeEach(() => {
    // Save original environment variables
    originalPrivateKey = process.env.BW_HEARTBEAT_PRIVATE_KEY;
    originalPublicKey = process.env.BW_HEARTBEAT_PUBLIC_KEY;
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalPrivateKey !== undefined) {
      process.env.BW_HEARTBEAT_PRIVATE_KEY = originalPrivateKey;
    } else {
      delete process.env.BW_HEARTBEAT_PRIVATE_KEY;
    }

    if (originalPublicKey !== undefined) {
      process.env.BW_HEARTBEAT_PUBLIC_KEY = originalPublicKey;
    } else {
      delete process.env.BW_HEARTBEAT_PUBLIC_KEY;
    }

    // Clear module cache to reset the cached key pair
    vi.resetModules();
  });

  describe("loadSigningKeyPair", () => {
    it("loads key pair from environment variables", () => {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      process.env.BW_HEARTBEAT_PRIVATE_KEY = Buffer.from(privateKey).toString("base64");
      process.env.BW_HEARTBEAT_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");

      const keyPair = loadSigningKeyPair();

      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.keyId).toBe("bw-heartbeat-signing-key-v1");
    });

    it("generates ephemeral keypair when environment variables are missing", () => {
      delete process.env.BW_HEARTBEAT_PRIVATE_KEY;
      delete process.env.BW_HEARTBEAT_PUBLIC_KEY;

      const keyPair = loadSigningKeyPair();

      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.keyId).toBe("bw-heartbeat-signing-key-v1");
    });

    it("caches the key pair across multiple calls", () => {
      const keyPair1 = loadSigningKeyPair();
      const keyPair2 = loadSigningKeyPair();

      expect(keyPair1).toBe(keyPair2); // Same object reference
    });
  });

  describe("signPayload and verifySignature", () => {
    it("signs a string payload and returns base64 signature", () => {
      const payload = "test payload string";
      const signature = signPayload(payload);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe("string");
      expect(signature.length).toBeGreaterThan(0);

      // Verify it's valid base64
      expect(() => Buffer.from(signature, "base64")).not.toThrow();
    });

    it("signs a JSON stringified object", () => {
      const payload = JSON.stringify({ userId: "agent_123", timestamp: Date.now() });
      const signature = signPayload(payload);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe("string");
    });

    it("verifies a valid signature", () => {
      const payload = "authentic data";
      const signature = signPayload(payload);

      const isValid = verifySignature(payload, signature);

      expect(isValid).toBe(true);
    });

    it("rejects invalid signature", () => {
      const payload = "test data";
      const invalidSignature = "aW52YWxpZF9zaWduYXR1cmVfZGF0YQ=="; // "invalid_signature_data" in base64

      const isValid = verifySignature(payload, invalidSignature);

      expect(isValid).toBe(false);
    });

    it("rejects signature for modified payload", () => {
      const originalPayload = "original message";
      const signature = signPayload(originalPayload);

      const modifiedPayload = "modified message";
      const isValid = verifySignature(modifiedPayload, signature);

      expect(isValid).toBe(false);
    });

    it("handles complex JSON payloads", () => {
      const complexPayload = JSON.stringify({
        agent: {
          id: "agent_complex",
          metadata: {
            framework: "openclaw",
            specializations: ["healthcare_improvement", "poverty_reduction"],
          },
        },
        timestamp: Date.now(),
        instructions: "Perform heartbeat check",
      });

      const signature = signPayload(complexPayload);
      const isValid = verifySignature(complexPayload, signature);

      expect(isValid).toBe(true);
    });

    it("signatures are deterministic for same payload", () => {
      const payload = "deterministic test";
      const signature1 = signPayload(payload);
      const signature2 = signPayload(payload);

      expect(signature1).toBe(signature2);
    });

    it("signatures differ for different payloads", () => {
      const payload1 = "message one";
      const payload2 = "message two";

      const signature1 = signPayload(payload1);
      const signature2 = signPayload(payload2);

      expect(signature1).not.toBe(signature2);
    });

    it("handles empty payload", () => {
      const emptyPayload = "";
      const signature = signPayload(emptyPayload);

      expect(signature).toBeDefined();

      const isValid = verifySignature(emptyPayload, signature);
      expect(isValid).toBe(true);
    });

    it("handles payload with special characters", () => {
      const payload = "Test with special chars: !@#$%^&*()_+{}[]|\\:\";<>?,./";

      const signature = signPayload(payload);
      const isValid = verifySignature(payload, signature);

      expect(isValid).toBe(true);
    });

    it("handles payload with unicode characters", () => {
      const payload = "测试中文 • Тест • 🔒🔑";

      const signature = signPayload(payload);
      const isValid = verifySignature(payload, signature);

      expect(isValid).toBe(true);
    });

    it("rejects malformed base64 signature", () => {
      const payload = "test data";
      const malformedSignature = "not-valid-base64!@#$";

      const isValid = verifySignature(payload, malformedSignature);

      expect(isValid).toBe(false);
    });
  });

  describe("getKeyId", () => {
    it("returns the key ID", () => {
      const keyId = getKeyId();

      expect(keyId).toBe("bw-heartbeat-signing-key-v1");
    });

    it("returns consistent key ID across multiple calls", () => {
      const keyId1 = getKeyId();
      const keyId2 = getKeyId();

      expect(keyId1).toBe(keyId2);
    });
  });
});
