// Vercel serverless function — fetches LinkedIn public profile and extracts
// Open Graph meta data (name, title/headline, photo URL)
// Used by admin panel to auto-fill key player fields from a LinkedIn URL.

export default async function handler(req, res) {
  // Allow CORS from same origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url || !url.includes('linkedin.com/in/')) {
    return res.status(400).json({ error: 'Invalid LinkedIn profile URL' });
  }

  try {
    // Fetch the LinkedIn public profile page
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!resp.ok) {
      return res.status(502).json({ error: `LinkedIn returned ${resp.status}` });
    }

    const html = await resp.text();

    // Extract Open Graph meta tags
    const ogData = {};
    const metaRegex = /<meta\s+(?:[^>]*?\s)?(?:property|name)=["'](og:[^"']+)["']\s+content=["']([^"']*)["'][^>]*>/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      ogData[match[1]] = match[2];
    }
    // Also try content-first format: <meta content="..." property="og:...">
    const metaRegex2 = /<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["'](og:[^"']+)["'][^>]*>/gi;
    while ((match = metaRegex2.exec(html)) !== null) {
      ogData[match[2]] = ogData[match[2]] || match[1];
    }

    // Extract from regular meta tags as fallback
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const descMatch = html.match(/<meta\s+(?:[^>]*?\s)?name=["']description["']\s+content=["']([^"']*)["']/i)
      || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);

    // Parse OG data
    // og:title is typically "FirstName LastName - Title - Company | LinkedIn"
    const ogTitle = ogData['og:title'] || titleMatch?.[1] || '';
    const ogDesc = ogData['og:description'] || descMatch?.[1] || '';
    const ogImage = ogData['og:image'] || '';

    // Parse name and title from og:title
    // Format: "FirstName LastName - Title - Company | LinkedIn"
    let name = '';
    let title = '';
    let company = '';

    const cleanTitle = ogTitle.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
    const parts = cleanTitle.split(/\s*[-–—]\s*/);
    if (parts.length >= 3) {
      name = parts[0].trim();
      title = parts[1].trim();
      company = parts[2].trim();
    } else if (parts.length === 2) {
      name = parts[0].trim();
      title = parts[1].trim();
    } else {
      name = cleanTitle;
    }

    // Try to extract company from og:description if not found
    // Description is typically: "Title at Company · Experience: ... · Education: ..."
    if (!company && ogDesc) {
      const atMatch = ogDesc.match(/^([^·]+?)\s+at\s+([^·]+)/i);
      if (atMatch) {
        if (!title) title = atMatch[1].trim();
        company = atMatch[2].trim();
      }
    }

    // Clean up photo URL - LinkedIn sometimes uses encoded URLs
    let photoUrl = ogImage;
    if (photoUrl) {
      // Decode HTML entities
      photoUrl = photoUrl.replace(/&amp;/g, '&');
    }

    return res.status(200).json({
      name: name || '',
      title: title || '',
      company: company || '',
      photoUrl: photoUrl || '',
      raw: { ogTitle, ogDesc, ogImage }
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
