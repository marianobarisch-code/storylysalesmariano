export default async function handler(req, res) {
  const { code, error } = req.query

  if (error) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#ef4444">Authorization Failed</h2>
        <p>${error}</p>
        <a href="/">Back to app</a>
      </body></html>
    `)
  }

  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth credentials not configured' })
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const redirectUri = `${protocol}://${host}/api/gmail/callback`

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()

    if (tokens.error) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center">
          <h2 style="color:#ef4444">Token Exchange Failed</h2>
          <p>${tokens.error_description || tokens.error}</p>
          <a href="/">Back to app</a>
        </body></html>
      `)
    }

    // Get user email to confirm which account was connected
    const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = await profileRes.json()

    // Send tokens back to the frontend via postMessage
    // The refresh_token is stored in localStorage for subsequent API calls
    res.status(200).send(`
      <html>
      <body style="font-family:sans-serif;padding:40px;text-align:center;background:#f8fafc">
        <div style="max-width:400px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2 style="color:#16a34a;margin-bottom:8px">Gmail Connected!</h2>
          <p style="color:#64748b;margin-bottom:24px">
            Connected as <strong>${profile.emailAddress || 'unknown'}</strong>
          </p>
          <p style="color:#94a3b8;font-size:13px">This window will close automatically...</p>
        </div>
        <script>
          // Send tokens to the parent window (the app)
          if (window.opener) {
            window.opener.postMessage({
              type: 'gmail_auth_success',
              refresh_token: ${JSON.stringify(tokens.refresh_token || '')},
              access_token: ${JSON.stringify(tokens.access_token || '')},
              email: ${JSON.stringify(profile.emailAddress || '')},
              expires_in: ${tokens.expires_in || 3600},
            }, '*');
            setTimeout(() => window.close(), 2000);
          }
        </script>
      </body>
      </html>
    `)
  } catch (err) {
    console.error('Gmail OAuth callback error:', err)
    res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#ef4444">Error</h2>
        <p>Failed to complete authorization. Please try again.</p>
        <a href="/">Back to app</a>
      </body></html>
    `)
  }
}
