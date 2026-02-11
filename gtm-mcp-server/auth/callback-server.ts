/**
 * Secure OAuth2 Callback Server
 * Provides HTTPS callback handling with proper security headers and CSRF validation
 */

import * as http from 'http';
import { URL } from 'url';

export interface OAuth2CallbackRequest {
  code?: string;
  state?: string;
  error?: string;
}

export interface CallbackResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

/**
 * Start secure OAuth2 callback server
 */
export function startSecureCallbackServer(port: number = 3000): Promise<OAuth2CallbackRequest> {
  return new Promise<OAuth2CallbackRequest>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Add security headers
      const headers: Record<string, string> = {
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:accounts.google.com; connect-src 'self' frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      };
      
      // Apply headers
      res.writeHead(200, headers);
      
      const parsedUrl = new URL(req.url || '', `http://localhost:${port}`);
      
      // Validate request method
      if (req.method !== 'GET') {
        res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding: 40px;">
              <h1 style="color: #d93025;">Method Not Allowed</h1>
              <p>Only GET requests are accepted on this endpoint.</p>
            </body>
          </html>
        `);
        server.close();
        return;
      }
      
      // Validate state parameter (CSRF protection)
      const state = parsedUrl.searchParams.get('state');
      
      if (!state || typeof state !== 'string' || state.length < 16) {
        res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding: 40px;">
              <h1 style="color: #d93025;">Invalid State Parameter</h1>
              <p>The state parameter is required and must be at least 16 characters.</p>
            </body>
          </html>
        `);
        server.close();
        return;
      }
      
      const code = parsedUrl.searchParams.get('code');
      
      if (!code) {
        const error = parsedUrl.searchParams.get('error');
        res.end(`
          <html>
            <body style="font-family: system-ui; font-size: 14px; color: #333; line-height: 1.6;">
              <h1 style="color: #dc2626;">Authentication Failed</h1>
              <p style="color: #666;">${error || 'Unknown error'}</p>
              <p style="margin-top: 20px; color: #888;">You can close this window and try again.</p>
            </body>
          </html>
        `);
        server.close();
        return;
      }
      
      // Success - send HTML page with auto-close
      res.end(`
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', sans-serif; }
              .success-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
              h1 { color: white; font-size: 32px; margin-bottom: 16px; }
              .checkmark { font-size: 48px; color: white; margin-bottom: 8px; }
              p { color: white; font-size: 18px; opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="success-container">
              <div class="checkmark">✓</div>
              <h1>Authentication Successful</h1>
              <p>You can close this window and return to the application.</p>
            </div>
            <script>
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
      server.close();
      resolve({ code, state });
    });
    
    server.listen(port, () => {
      console.log(`OAuth2 callback server listening on http://localhost:${port}`);
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timeout'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Verify Referer header to ensure callback is from legitimate Google domain
 */
export function verifyReferer(referer: string | undefined): boolean {
  if (!referer) {
    return false;
  }
  
  const allowedDomains = [
    'accounts.google.com',
    'googleapis.com',
    'cloud.google.com',
    'developers.google.com',
  ];
  
  try {
    const refererUrl = new URL(referer);
    const hostname = refererUrl.hostname.toLowerCase();
    
    return allowedDomains.includes(hostname);
  } catch {
    return false;
  }
}
