const sgMail = require('@sendgrid/mail');

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = parseBody(req);
  const firstName = String(body.firstName || '').trim();
  const email = String(body.email || '').trim();
  const experience = String(body.experience || '').trim();
  const hype = String(body.hype || '').trim();
  const platform = Array.isArray(body.platform) ? body.platform.map(String) : [];
  const earlyAccess = Boolean(body.earlyAccess);
  const consent = Boolean(body.consent);

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'Consent is required' });
  }

  const hasSendgrid = Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_TO && process.env.SENDGRID_FROM);

  if (hasSendgrid) {
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const msg = {
        to: process.env.SENDGRID_TO,
        from: process.env.SENDGRID_FROM,
        subject: `Waitlist signup: ${email}`,
        text: `New waitlist signup\n\nName: ${firstName}\nEmail: ${email}\nExperience: ${experience}\nHype: ${hype}\nPlatforms: ${platform.join(', ')}\nEarly Access: ${earlyAccess}`,
        html: `<p><strong>Name:</strong> ${firstName || '—'}</p>
               <p><strong>Email:</strong> ${email}</p>
               <p><strong>Experience:</strong> ${experience || '—'}</p>
               <p><strong>Hype:</strong> ${hype || '—'}</p>
               <p><strong>Platforms:</strong> ${platform.join(', ') || '—'}</p>
               <p><strong>Early Access:</strong> ${earlyAccess ? 'Yes' : 'No'}</p>`
      };
      await sgMail.send(msg);
    } catch (err) {
      console.error('SendGrid error', err);
      // Proceed without failing the user; we still accept the signup.
    }
  } else {
    console.log('Waitlist signup (no email configured):', {
      firstName,
      email,
      experience,
      hype,
      platform,
      earlyAccess,
      consent,
    });
  }

  return res.status(200).json({ ok: true });
};


