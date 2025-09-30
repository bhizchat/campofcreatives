// Signed Event Webhook handler for SendGrid
// Expects raw body for signature verification
const { EventWebhook, EventWebhookHeader } = require('@sendgrid/eventwebhook');

// Read raw body from the request stream
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    const signature = req.headers[EventWebhookHeader.SIGNATURE.toLowerCase()];
    const timestamp = req.headers[EventWebhookHeader.TIMESTAMP.toLowerCase()];

    const rawBody = await readRawBody(req);

    if (publicKey && signature && timestamp) {
      const ew = new EventWebhook();
      const verified = ew.verifySignature(publicKey, rawBody, signature, timestamp);
      if (!verified) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    // Log the events for now; you can persist to a datastore later
    let events = [];
    try {
      events = JSON.parse(rawBody.toString('utf8'));
    } catch {
      // SendGrid can batch JSON lines; split if needed
      const lines = rawBody.toString('utf8').trim().split('\n');
      events = lines.map((l) => JSON.parse(l));
    }

    console.log('SendGrid events:', events.map((e) => ({ event: e.event, email: e.email, sg_event_id: e.sg_event_id })));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('sg-events error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


