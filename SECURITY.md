# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting instead: go to the repository's **Security** tab and click **Report a vulnerability**. Include the steps to reproduce the problem and its impact. You should get a reply within 7 days.

## How the app protects you

- **OAuth with PKCE**: there is no client secret, and each user uses their own Spotify app. Only the read-only scopes `user-read-currently-playing` and `user-read-playback-state` are requested.
- **State parameter**: the login callback checks a random `state` value. The temporary login server listens on `127.0.0.1` only and closes after login or after 5 minutes.
- **Token storage**: tokens are encrypted with Electron `safeStorage` (Windows DPAPI, macOS Keychain, or libsecret/kwallet on Linux). Plain-text storage is used only if the OS provides no encryption.
- **Renderer isolation**: all windows run with `contextIsolation`, `sandbox` and no Node integration, under a strict Content-Security-Policy. Navigation and pop-ups are blocked, and only `https://` links open in your browser.
- **IPC validation**: every IPC call checks that it comes from one of the app's own windows. Every setting is validated by type and range before it is saved.
- **OBS server**: off by default. It binds to `127.0.0.1` only, serves read-only files from two fixed folders (with path-traversal protection) and never exposes tokens.
- **No telemetry**: the app makes network requests only to `accounts.spotify.com`, `api.spotify.com` and Spotify's image CDN.
