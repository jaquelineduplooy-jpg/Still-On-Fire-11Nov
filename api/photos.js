/* Still On Fire V21: server-side relay of the existing public Google Apps Script feed.
   The same-origin endpoint avoids browser CORS failures on TV. No Google credentials are used.
*/
const SOURCE = 'https://script.google.com/macros/s/AKfycbyaEMBcOb0-FisrU5Zm3yi4w9ptceioZ2Ng8PJJJq0G6KBGcEPNdmloexOXgNlugCHe/exec';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({error:'Method not allowed'});
  }
  try {
    const upstream = await fetch(SOURCE, {redirect:'follow', signal:AbortSignal.timeout(18000)});
    if (!upstream.ok) throw new Error('Feed returned HTTP ' + upstream.status);
    const json = await upstream.json();
    if (!json || typeof json !== 'object') throw new Error('Feed is not JSON');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
    return res.status(200).json(json);
  } catch (e) {
    console.error('[Memory reel photo relay]', e.message);
    return res.status(502).json({error:'Photo feed temporarily unavailable'});
  }
};
