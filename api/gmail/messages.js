export default async function handler(req, res) {
  // Allow GET and POST
  const refreshToken = req.method === 'POST' ? req.body?.refresh_token : req.query.refresh_token
  const query = req.method === 'POST' ? req.body?.query : req.query.query

  if (!refreshToken) {
    return res.status(400).json({ error: 'refresh_token is required' })
  }
  if (!query) {
    return res.status(400).json({ error: 'query is required (email address or company domain)' })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth credentials not configured' })
  }

  try {
    // Refresh the access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    })

    const tokenData = await tokenRes.json()
    if (tokenData.error) {
      return res.status(401).json({ error: 'Token refresh failed. Please reconnect Gmail.', detail: tokenData.error })
    }

    const accessToken = tokenData.access_token

    // Search for emails matching the query (email address or domain)
    // Gmail search syntax: from:email OR to:email
    const gmailQuery = `from:${query} OR to:${query}`
    const maxResults = req.query.max || 20

    const searchRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const searchData = await searchRes.json()

    if (!searchData.messages || searchData.messages.length === 0) {
      return res.status(200).json({ messages: [], total: 0 })
    }

    // Fetch details for each message (headers only for speed)
    const messages = await Promise.all(
      searchData.messages.slice(0, 15).map(async (msg) => {
        const msgRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const msgData = await msgRes.json()
        const headers = msgData.payload?.headers || []
        const getHeader = (name) => (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || ''

        return {
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: msgData.snippet || '',
          labelIds: msgData.labelIds || [],
        }
      })
    )

    // Sort by date descending
    messages.sort((a, b) => new Date(b.date) - new Date(a.date))

    return res.status(200).json({
      messages,
      total: searchData.resultSizeEstimate || messages.length,
    })
  } catch (err) {
    console.error('Gmail messages error:', err)
    return res.status(500).json({ error: 'Failed to fetch Gmail messages' })
  }
}
