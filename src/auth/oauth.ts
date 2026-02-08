/**
 * OAuth2 Authentication for Google Tag Manager API
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { URL } from 'url';

// Scopes required for GTM API
const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.manage.accounts',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/tagmanager.readonly',
];

// Config directory
const CONFIG_DIR = path.join(process.env.HOME || '', '.gtm-mcp');
const TOKEN_PATH = path.join(CONFIG_DIR, 'tokens.json');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'client_secrets.json');

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
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
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
 * Saves OAuth2 tokens to disk
 */
export function saveTokens(tokens: TokenData): void {
  ensureConfigDir();
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/**
 * Loads stored OAuth2 tokens
 */
export function loadTokens(): TokenData | null {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  const content = fs.readFileSync(TOKEN_PATH, 'utf8');
  return JSON.parse(content);
}

/**
 * Creates an OAuth2 client from credentials
 */
export function createOAuth2Client(credentials: Credentials): OAuth2Client {
  const config = credentials.installed || credentials.web;
  if (!config) {
    throw new Error('Invalid credentials format');
  }

  return new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    'http://localhost:3000/oauth2callback'
  );
}

/**
 * Generates the authorization URL
 */
export function getAuthUrl(oauth2Client: OAuth2Client): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });
}

/**
 * Exchanges authorization code for tokens
 */
export async function getTokensFromCode(
  oauth2Client: OAuth2Client,
  code: string
): Promise<TokenData> {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens as TokenData;
}

/**
 * Starts a local server to handle OAuth2 callback
 */
export function startCallbackServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost:3000');
      const code = url.searchParams.get('code');

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>✅ Authentifizierung erfolgreich!</h1>
              <p>Du kannst dieses Fenster jetzt schließen.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
        server.close();
        resolve(code);
      } else {
        const error = url.searchParams.get('error');
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>❌ Authentifizierung fehlgeschlagen</h1>
              <p>${error || 'Unbekannter Fehler'}</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error(error || 'Authentication failed'));
      }
    });

    server.listen(3000, () => {
      console.log('OAuth callback server listening on http://localhost:3000');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Gets an authenticated OAuth2 client
 * Returns null if authentication is needed
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
  oauth2Client.on('tokens', (newTokens) => {
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
