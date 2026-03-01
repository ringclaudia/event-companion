// Vercel serverless function — proxies badge scan requests to Anthropic
// API key stays server-side in ANTHROPIC_API_KEY env var

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Verify team PIN
  const pin = req.headers['x-team-pin'] || '';
  const expectedPin = process.env.TEAM_PIN || '';
  if (expectedPin && pin !== expectedPin) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  try {
    const { base64, mediaType } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'Missing base64 image data' });
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
            { type: 'text', text: 'Extract contact info from this badge/business card photo. Return ONLY a JSON object with these fields (use empty string if not visible): {"firstName":"","lastName":"","title":"","company":"","linkedin":"","email":"","phone":"","notes":""}. Split the name into first and last. If you see a LinkedIn URL or QR code pointing to LinkedIn, include it. No markdown, no explanation.' }
          ]
        }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `Anthropic API error: ${resp.status}`, detail: errText });
    }

    const data = await resp.json();
    return res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
