/**
 * OAuth2 Authentication for Google Tag Manager API
 */

import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Scopes required for GTM API
const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.delete.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.manage.accounts',
  'https://www.googleapis.com/auth/tagmanager.manage.users',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/tagmanager.readonly',
];

// Config directory
const CONFIG_DIR = path.join(process.env.HOME || '', '.gtm-mcp');
const TOKEN_PATH = path.join(CONFIG_DIR, 'tokens.json');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'client_secrets.json');
const KEY_PATH = path.join(CONFIG_DIR, 'encryption.key');

// Encrypted token path (mode 0o600)
const ENCRYPTED_TOKEN_PATH = path.join(CONFIG_DIR, 'tokens.encrypted');
const ALGORITHM = 'aes-256-gcm';

// Optional override: provide a 32-byte key as hex (64 hex chars).
const ENCRYPTION_KEY_HEX = process.env.GTM_ENCRYPTION_KEY;

export interface Credentials {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

export interface TokenData {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

/**
 * Ensures the config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Loads OAuth2 credentials from client_secrets.json
 */
export function loadCredentials(): Credentials | null {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    return null;
  }
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  return JSON.parse(content);
}

/**
 * Encrypt tokens using AES-256-GCM
 */
function encryptTokens(tokens: TokenData): string {
  const key = getEncryptionKey();
  // 96-bit IV recommended for GCM
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt tokens using AES-256-GCM
 */
function decryptTokens(encrypted: string): TokenData {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ciphertext = Buffer.from(parts[2], 'hex');
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * Get encryption key (in production, use OS keychain/keyring)
 */
function getEncryptionKey(): Buffer {
  ensureConfigDir();

  if (ENCRYPTION_KEY_HEX) {
    if (!validateEncryptionKey(ENCRYPTION_KEY_HEX)) {
      throw new Error('Invalid GTM_ENCRYPTION_KEY. Expected 64 hex chars (32 bytes).');
    }
    return Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
  }

  if (fs.existsSync(KEY_PATH)) {
    const keyHex = fs.readFileSync(KEY_PATH, 'utf8').trim();
    if (!validateEncryptionKey(keyHex)) {
      throw new Error(`Invalid encryption key in ${KEY_PATH}. Expected 64 hex chars (32 bytes).`);
    }
    return Buffer.from(keyHex, 'hex');
  }

  const keyHex = generateEncryptionKey();
  fs.writeFileSync(KEY_PATH, `${keyHex}\n`, { mode: 0o600 });
  return Buffer.from(keyHex, 'hex');
}

/**
 * Generate a secure encryption key for new installations
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate encryption key format
 */
export function validateEncryptionKey(key: string): boolean {
  return /^[0-9a-f]{64}$/i.test(key);
}

/**
 * Clear encryption key from environment
 */
export function clearEncryptionKey(): void {
  delete process.env.GTM_ENCRYPTION_KEY;
}

/**
 * Saves OAuth2 tokens to disk securely with encryption
 */
export function saveTokens(tokens: TokenData): void {
  ensureConfigDir();
  const encrypted = encryptTokens(tokens);
  fs.writeFileSync(ENCRYPTED_TOKEN_PATH, JSON.stringify(encrypted), { mode: 0o600 });
}

/**
 * Load encrypted tokens from disk
 */
export function loadEncryptedTokens(): TokenData | null {
  if (!fs.existsSync(ENCRYPTED_TOKEN_PATH)) {
    return null;
  }
  const encrypted = fs.readFileSync(ENCRYPTED_TOKEN_PATH, 'utf8');
  return decryptTokens(JSON.parse(encrypted));
}

/**
 * Loads stored OAuth2 tokens (supports both encrypted and unencrypted for migration)
 */
export function loadTokens(): TokenData | null {
  // Try encrypted tokens first
  if (fs.existsSync(ENCRYPTED_TOKEN_PATH)) {
    return loadEncryptedTokens();
  }
  
  // Fall back to old unencrypted format (for migration)
  if (fs.existsSync(TOKEN_PATH)) {
    const content = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(content);
  }
  
  return null;
}

export function createOAuth2Client(credentials: Credentials): OAuth2Client {
  const cfg = credentials.installed || credentials.web;
  if (!cfg) {
    throw new Error('Invalid OAuth2 credentials file: missing "installed" or "web" section.');
  }

  const redirectUri = (cfg.redirect_uris || []).find((u) => u.includes('localhost')) || cfg.redirect_uris?.[0];
  if (!redirectUri) {
    throw new Error('Invalid OAuth2 credentials: missing redirect_uris.');
  }

  return new OAuth2Client(cfg.client_id, cfg.client_secret, redirectUri);
}

export function getAuthUrl(oauth2Client: OAuth2Client, state: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

export async function getTokensFromCode(oauth2Client: OAuth2Client, code: string): Promise<TokenData> {
  const { tokens } = await oauth2Client.getToken(code);
  return {
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  };
}

/**
 * Gets an authenticated OAuth2 client
 * Returns null if authentication is needed.
 */
export async function getAuthenticatedClient(): Promise<OAuth2Client | null> {
  const credentials = loadCredentials();
  if (!credentials) {
    return null;
  }

  const oauth2Client = createOAuth2Client(credentials);
  const tokens = loadTokens();

  if (!tokens) {
    return null;
  }

  oauth2Client.setCredentials(tokens);

  // Set up automatic token refresh
  oauth2Client.on('tokens', (newTokens: any) => {
    const updatedTokens: TokenData = {
      access_token: newTokens.access_token || tokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      scope: newTokens.scope || tokens.scope,
      token_type: newTokens.token_type || tokens.token_type,
      expiry_date: newTokens.expiry_date || tokens.expiry_date,
    };
    saveTokens(updatedTokens);
  });

  return oauth2Client;
}

/**
 * Checks if credentials file exists
 */
export function hasCredentials(): boolean {
  return fs.existsSync(CREDENTIALS_PATH);
}

/**
 * Checks if tokens exist and are valid
 */
export function hasValidTokens(): boolean {
  const tokens = loadTokens();
  if (!tokens) return false;

  // Check if token is expired (with 5 min buffer)
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 5 * 60 * 1000) {
    // Token expired, but we might have refresh token
    return !!tokens.refresh_token;
  }

  return true;
}

/**
 * Returns the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Returns the credentials file path
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}
