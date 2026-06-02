export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { linkedin_url } = req.body
  if (!linkedin_url) {
    return res.status(400).json({ error: 'linkedin_url is required' })
  }

  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'APOLLO_API_KEY not configured. Add it in Vercel → Settings → Environment Variables.' })
  }

  try {
    const response = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        linkedin_url: linkedin_url,
      }),
    })

    const data = await response.json()

    if (data.person) {
      const p = data.person
      const org = p.organization || {}
      return res.status(200).json({
        full_name: [p.first_name, p.last_name].filter(Boolean).join(' '),
        title: p.title || '',
        company: org.name || '',
        industry: org.industry || '',
        company_size: org.estimated_num_employees ? String(org.estimated_num_employees) : '',
        country: p.country || '',
        city: p.city || '',
        email: p.email || '',
        phone: (p.phone_numbers && p.phone_numbers[0]?.sanitized_number) || '',
        linkedin_url: p.linkedin_url || linkedin_url,
        photo_url: p.photo_url || '',
      })
    }

    return res.status(404).json({ error: 'Person not found in Apollo database' })
  } catch (err) {
    console.error('Apollo enrichment error:', err)
    return res.status(500).json({ error: 'Failed to enrich lead. Check API key and try again.' })
  }
}
