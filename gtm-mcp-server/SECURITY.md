# Security Requirements

## OAuth 2.0 State Parameter

All OAuth 2.0 requests must include a cryptographic `state` parameter to prevent CSRF (Cross-Site Request Forgery) attacks.

**Implementation:**
- Generate a random 32-byte cryptographically secure string
- Include it in the authorization URL
- Validate it when processing the callback
- Store it temporarily in memory (session) and invalidate after use

**Example:**
```typescript
import { randomBytes } from 'crypto';

export function generateState(): string {
  return randomBytes(32).toString('base64url');
}
```

**Do NOT use:**
- Static, predictable strings like "12345"
- Timestamp-based values
- Session IDs

## Token Storage

OAuth access tokens and refresh tokens must be stored securely:

**Proper storage methods:**
1. **Operating System Keychain** (macOS) - Most secure for user credentials
2. **Windows Credential Manager** - For Windows systems
3. **Encrypted files** - With strong encryption (AES-256) if keychain not available

**File-based storage requirements:**
- File permissions: `0o600` (read/write for owner only)
- Directory permissions: `0o700` (owner access only)
- Encrypted content with AES-256-GCM
- Key management: 
  - Key stored separately (not in same file as tokens)
  - Different key per deployment
  - Consider using OS keychain/keyring for key storage

**Prohibited:**
- Storing tokens in plain text
- World-readable files (mode `0o644`)
- Tokens committed to version control
- Tokens logged in console output

## Path Traversal Prevention

All file paths must be validated and normalized before use:

**Validation rules:**
1. Always use `path.resolve()` to normalize paths
2. Validate that resolved path is within intended directory
3. Reject paths containing: `..` or symlinks
4. Use absolute paths for all file operations

**Example:**
```typescript
import { resolve, normalize } from 'path';
import { homedir } from 'os';

export function getSafeConfigPath(filename: string): string {
  const homeDir = homedir();
  const configDir = resolve(homeDir, '.gtm-mcp');
  const normalizedPath = normalize(configDir);
  
  // Ensure path is within HOME directory
  if (!normalizedPath.startsWith(homeDir)) {
    throw new Error(`Config directory must be within HOME: ${normalizedPath}`);
  }
  
  return resolve(normalizedPath, filename);
}
```

## Rate Limiting

Implement exponential backoff for API requests:

**Algorithm:**
- Initial delay: 1000ms
- Multiplier: 2
- Max delay: 60000ms (60 seconds)
- Jitter: Random milliseconds (0-1000ms)
- Stop after: ~5 retries (total ~32s delay)

**Example:**
```typescript
// Import from google-auth-library
import { exponentialBackoff } from 'google-auth-library/build/src/exponential_backoff.js';

export async function withRetry<T>(
  fn: () => Promise<T>
): Promise<T> {
  const backoff = new exponentialBackoff({
    initialDelay: 1000,
    maxDelay: 60000,
    factor: 2,
  });
  
  return backoff.execute(fn);
}
```

## Refresh Token Limits

GTM API has a hard limit of 25 active refresh tokens per client ID/account combination.

**Best practices:**
- Implement token caching with LRU (Least Recently Used) strategy
- Rotate refresh tokens by acquiring new ones before limit
- Invalidate oldest token when approaching limit
- Track token count in token metadata
- Return clear error when limit exceeded with instructions

## Scope Validation

Always validate OAuth scopes against GTM API requirements:

**GTM API v2 Scopes:**
- `https://www.googleapis.com/auth/tagmanager.edit.containers`
- `https://www.googleapis.com/auth/tagmanager.delete.containers`
- `https://www.googleapis.com/auth/tagmanager.publish`
- `https://www.googleapis.com/auth/tagmanager.manage.users`
- `https://www.googleapis.com/auth/tagmanager.manage.accounts`

**Validation:**
```typescript
const REQUIRED_SCOPES = new Set([
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.publish',
]);

export function validateScopes(scopes: string[]): boolean {
  return scopes.some(scope => REQUIRED_SCOPES.has(scope));
}
```

## Error Handling

Handle GTM API error responses according to official documentation:

**Error Codes:**
- `400` - Bad Request (invalid parameters, filter format)
- `401` - Unauthorized (invalid or expired access token)
- `403` - Forbidden (quota exceeded, insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (version mismatch, concurrent modification)
- `429` - Too Many Requests (rate limit exceeded)

**Best practices:**
- Parse error body for detailed messages
- Sanitize error messages before displaying to users
- Log errors with context (operation, parameters)
- Implement retry logic for 5xx errors
- Don't expose internal paths in error messages

## Input Validation

Validate all user-provided input according to GTM API specifications:

**Trigger types (v2 format - camelCase):**
- Web: `pageview`, `customEvent`, `click`, `formSubmission`, `timer`, `scrollDepth`, etc.
- Server: `always`, `customEvent`, `triggerGroup`, `init`, `consentInit`, `serverPageview`

**Container paths:**
- Format: `accounts/{accountId}/containers/{containerId}/workspaces/{workspaceId}`
- Must contain valid numeric IDs

**Variable types:**
- Constants: `k`
- Cookie: `c`
- URL Variable: `v`
- Data Layer: `f`
- JavaScript Macro: `jsm`
- Auto-Event Variable: `aev`

**Parameter validation:**
- All parameters must include `key`, `type`, and `value` fields
- Valid types: `template`, `integer`, `boolean`, `list`, `map`, `triggerReference`, `tagReference`
- Type field is REQUIRED for all parameters

## Audit Logging

Log all destructive operations for security monitoring:

**Log format (JSON):**
```json
{
  "timestamp": "2024-02-10T12:00:00Z",
  "operation": "delete_tag",
  "resource": "accounts/123/containers/456/workspaces/789/tags/101",
  "user": "user@example.com",
  "success": true,
  "error": null
}
```

**Operations to log:**
- Delete operations (tags, triggers, variables, containers)
- Publish version operations
- Create operations for critical resources
- User permission changes
- Container deletion

**Best practices:**
- Write-only log file (append mode)
- Secure file location: `~/.gtm-mcp/audit.log`
- Rotate logs regularly
- Include correlation IDs for request tracing
- Encrypt logs containing sensitive data

## HTTPS and TLS

Always use HTTPS for all API communications:

**Requirements:**
- TLS 1.2 or higher
- Valid certificates from trusted CAs
- Certificate pinning for production (optional)
- HTTP/2 in production environments

## Memory Safety

Prevent sensitive data exposure in memory:

**Guidelines:**
- Minimize token lifetime in memory
- Clear sensitive data after use
- Don't log full tokens (log only last 4 characters or "REDACTED")
- Use `Buffer.from()` instead of string concatenation for secrets

## Dependency Management

Keep all dependencies up to date:

**Security-focused dependencies:**
- `googleapis` - Official Google API client (includes security patches)
- `google-auth-library` - OAuth 2.0 implementation with proper token handling
- `@modelcontextprotocol/sdk` - MCP SDK (official, maintained)

**Update strategy:**
- Run `npm audit` regularly
- Dependabot for vulnerability scanning
- Subscribe to security advisories
- Fix high-severity issues within 7 days

## Server-Side GTM Considerations

If implementing server-side GTM features:

**Additional security:**
- Validate all input parameters more strictly (no client-side validation)
- Implement rate limiting per workspace
- Sanitize all template code before execution
- Restrict transformation access by workspace
- Implement request signing for critical operations

## Testing

Comprehensive security testing approach:

**Unit tests:**
- OAuth flow with state validation
- Token encryption/decryption
- Path traversal prevention
- Input sanitization
- Error handling for all GTM error codes

**Integration tests:**
- E2E OAuth flow with mock GTM API
- Token refresh after expiration
- Rate limit behavior
- Concurrent request handling

**Security tests:**
- CSRF attack attempts
- Path traversal attempts
- XSS in error messages
- Injection attacks in parameters

## Incident Response

Have a documented incident response plan:

**Immediate actions (first 1 hour):**
1. Revoke any leaked tokens
2. Disable affected functionality if critical
3. Check audit logs for related activity
4. Notify security team

**Investigation (first 24 hours):**
1. Analyze attack vector
2. Determine impact scope
3. Identify affected users/data
4. Root cause analysis

**Recovery (first 72 hours):**
1. Apply security fixes
2. Reset compromised credentials
3. Rotate all tokens if needed
4. Enhance monitoring

**Post-incident:**
1. Complete incident report
2. Update documentation
3. Add prevention measures to testing
4. Conduct retrospective (post-mortem)
