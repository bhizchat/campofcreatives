module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  return res.status(200).json({ ok: true, route: '/api/ping', method: 'GET' });
};


