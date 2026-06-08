import { kv } from '@vercel/kv'

const DATA_KEY = 'storyly_pipeline_v1'

export default async function handler(req, res) {
  // CORS headers for frontend
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // GET — load data from KV
    if (req.method === 'GET') {
      const data = await kv.get(DATA_KEY)
      if (data) {
        return res.status(200).json({ ok: true, data })
      }
      return res.status(200).json({ ok: true, data: null })
    }

    // POST — save data to KV
    if (req.method === 'POST') {
      const { data } = req.body
      if (!data) {
        return res.status(400).json({ ok: false, error: 'No data provided' })
      }
      await kv.set(DATA_KEY, data)
      return res.status(200).json({ ok: true, saved: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('KV data error:', err)
    return res.status(500).json({ ok: false, error: 'Database error: ' + err.message })
  }
}
