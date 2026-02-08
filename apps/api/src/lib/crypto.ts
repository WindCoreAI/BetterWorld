import crypto from "crypto";

const KEY_ID = "bw-heartbeat-signing-key-v1";

interface KeyPair {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  keyId: string;
}

let cachedKeyPair: KeyPair | null = null;

export function loadSigningKeyPair(): KeyPair {
  if (cachedKeyPair) return cachedKeyPair;

  const privateKeyBase64 = process.env.BW_HEARTBEAT_PRIVATE_KEY;
  const publicKeyBase64 = process.env.BW_HEARTBEAT_PUBLIC_KEY;

  if (!privateKeyBase64 || !publicKeyBase64) {
    // Generate ephemeral keypair for development
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    cachedKeyPair = { privateKey, publicKey, keyId: KEY_ID };
    return cachedKeyPair;
  }

  const privateKeyPem = Buffer.from(privateKeyBase64, "base64").toString("utf-8");
  const publicKeyPem = Buffer.from(publicKeyBase64, "base64").toString("utf-8");

  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKey = crypto.createPublicKey(publicKeyPem);

  cachedKeyPair = { privateKey, publicKey, keyId: KEY_ID };
  return cachedKeyPair;
}

export function signPayload(data: string): string {
  const { privateKey } = loadSigningKeyPair();
  const signature = crypto.sign(null, Buffer.from(data), privateKey);
  return signature.toString("base64");
}

export function verifySignature(data: string, signature: string): boolean {
  const { publicKey } = loadSigningKeyPair();
  return crypto.verify(null, Buffer.from(data), publicKey, Buffer.from(signature, "base64"));
}

export function getKeyId(): string {
  const { keyId } = loadSigningKeyPair();
  return keyId;
}
