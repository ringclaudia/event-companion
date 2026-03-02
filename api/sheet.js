// Vercel serverless function — proxies Google Sheets sync requests
// Avoids CORS / redirect issues with Google Apps Script web apps
// POST = push a lead, GET = pull all leads

export default async function handler(req, res) {
  // Verify team PIN
  const pin = req.headers['x-team-pin'] || '';
  const expectedPin = process.env.TEAM_PIN || '';
  if (expectedPin && pin !== expectedPin) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  // Sheet URL from env var (preferred) or client header
  const sheetUrl = process.env.GOOGLE_SHEET_URL || req.headers['x-sheet-url'];
  if (!sheetUrl) {
    return res.status(400).json({ error: 'No sheet URL configured' });
  }

  try {
    if (req.method === 'POST') {
      // Push a single lead to the Google Sheet
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      // Use redirect:'manual' — GAS returns 302 after processing the POST.
      // Following the redirect would change the method to GET (per HTTP spec),
      // but we don't need the response content, just confirmation it was accepted.
      const resp = await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'manual'
      });

      // 302/303 = GAS accepted & processed the request, redirecting to response page
      // 200 = direct success (some GAS deployments)
      if (resp.status === 302 || resp.status === 303 || resp.status === 200) {
        return res.status(200).json({ ok: true });
      }

      // Anything else is an error
      const text = await resp.text().catch(() => '');
      return res.status(502).json({
        error: 'Sheet error',
        status: resp.status,
        detail: text.slice(0, 500)
      });
    }

    if (req.method === 'GET') {
      // Pull all leads from the Google Sheet
      const resp = await fetch(sheetUrl, { redirect: 'follow' });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return res.status(502).json({
          error: 'Sheet returned ' + resp.status,
          detail: text.slice(0, 500)
        });
      }
      const text = await resp.text();
      // Apps Script may return JSON or HTML-wrapped JSON; try to parse
      try {
        const data = JSON.parse(text);
        return res.status(200).json(data);
      } catch {
        return res.status(502).json({
          error: 'Invalid JSON from sheet',
          body: text.slice(0, 500)
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
