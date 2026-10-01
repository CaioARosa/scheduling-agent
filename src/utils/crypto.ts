import crypto from 'crypto';
import { config } from '../config/unifiedConfig.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export function encrypt(text: string): string {
  // Ensure we have a valid 32-byte key
  const rawKey = config.security.encryptionKey;
  const key = crypto.scryptSync(rawKey, 'salt', 32);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const rawKey = config.security.encryptionKey;
  const key = crypto.scryptSync(rawKey, 'salt', 32);

  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Formato de texto criptografado inválido.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
