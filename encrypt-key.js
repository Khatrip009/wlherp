// encrypt-key.js
import { randomBytes, createCipheriv } from 'crypto';

function encrypt(plaintext, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

const masterKey = process.argv[2];
const apiKey = process.argv[3];
if (!masterKey || !apiKey) {
  console.error('Usage: node encrypt-key.js <MASTER_KEY_BASE64> <RESEND_API_KEY>');
  process.exit(1);
}
console.log(encrypt(apiKey, masterKey));