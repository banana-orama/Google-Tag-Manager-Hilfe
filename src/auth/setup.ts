#!/usr/bin/env node
/**
 * OAuth2 Setup Script
 * Run with: npm run auth
 */

import open from 'open';
import {
  ensureConfigDir,
  loadCredentials,
  createOAuth2Client,
  getAuthUrl,
  getTokensFromCode,
  saveTokens,
  startCallbackServer,
  getCredentialsPath,
  getConfigDir,
} from './oauth.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           GTM MCP Server - OAuth2 Setup                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  // Ensure config directory exists
  ensureConfigDir();

  // Check for credentials
  const credentials = loadCredentials();
  if (!credentials) {
    console.log('❌ Keine OAuth2 Credentials gefunden!');
    console.log();
    console.log('Bitte folgende Schritte ausführen:');
    console.log();
    console.log('1. Gehe zu: https://console.cloud.google.com/apis/credentials');
    console.log('2. Erstelle eine OAuth2 Client ID (Typ: Desktop App)');
    console.log('3. Lade die JSON-Datei herunter');
    console.log(`4. Speichere sie als: ${getCredentialsPath()}`);
    console.log();
    console.log('Hinweis: Die Tag Manager API muss aktiviert sein:');
    console.log('   https://console.cloud.google.com/apis/library/tagmanager.googleapis.com');
    console.log();
    process.exit(1);
  }

  console.log('✅ OAuth2 Credentials gefunden');
  console.log();

  // Create OAuth2 client
  const oauth2Client = createOAuth2Client(credentials);

  // Start callback server
  console.log('🌐 Starte lokalen OAuth2 Callback Server...');
  const codePromise = startCallbackServer();

  // Generate and open auth URL
  const authUrl = getAuthUrl(oauth2Client);
  console.log();
  console.log('📱 Öffne Browser zur Authentifizierung...');
  console.log();
  console.log('Falls der Browser nicht öffnet, besuche manuell:');
  console.log(authUrl);
  console.log();

  // Open browser
  await open(authUrl);

  try {
    // Wait for callback
    console.log('⏳ Warte auf Authentifizierung...');
    const code = await codePromise;

    // Exchange code for tokens
    console.log('🔄 Tausche Authorization Code gegen Tokens...');
    const tokens = await getTokensFromCode(oauth2Client, code);

    // Save tokens
    saveTokens(tokens);

    console.log();
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              ✅ Authentifizierung erfolgreich!             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`Tokens gespeichert in: ${getConfigDir()}/tokens.json`);
    console.log();
    console.log('Du kannst den MCP Server jetzt starten mit:');
    console.log('   npm start');
    console.log();
  } catch (error) {
    console.error();
    console.error('❌ Authentifizierung fehlgeschlagen:', error);
    process.exit(1);
  }
}

main();
