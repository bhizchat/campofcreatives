const Busboy = require('busboy');
const sgMail = require('@sendgrid/mail');

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB cap to stay under Vercel's 4.5 MB limit

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_BYTES } });

    const fields = {};
    let fileObj = null;

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, file, info) => {
      const { filename, mimeType } = info || {};
      const chunks = [];
      let truncated = false;

      file.on('limit', () => {
        truncated = true;
      });
      file.on('data', (d) => chunks.push(d));
      file.on('error', reject);
      file.on('end', () => {
        if (truncated) {
          const err = new Error('File too large');
          err.code = 'LIMIT_FILE_SIZE';
          return reject(err);
        }
        fileObj = {
          field: name,
          filename: filename || 'resume',
          mimeType: mimeType || 'application/octet-stream',
          buffer: Buffer.concat(chunks),
        };
      });
    });

    bb.on('error', reject);
    bb.on('finish', () => resolve({ fields, file: fileObj }));
    req.pipe(bb);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const hasSendgrid = Boolean(
    process.env.SENDGRID_API_KEY &&
      process.env.SENDGRID_TO &&
      process.env.SENDGRID_FROM
  );

  try {
    const { fields, file } = await parseMultipart(req);

    const name = (fields.fullName || fields.name || '').trim();
    const email = (fields.email || '').trim();
    const position = (fields.jobPosition || fields.position || fields.role || '').trim();

    const errors = {};
    if (!name) errors.fullName = ['Name is required'];
    if (!email) errors.email = ['Email is required'];
    if (!position) errors.position = ['Position is required'];
    if (!file) errors.resume = ['Resume / CV is required'];

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    const plain = `New job application\n\nName: ${name}\nEmail: ${email}\nPosition: ${position}\nWebsite: ${fields.linkPortfolio || fields.website || '—'}\nLinkedIn: ${fields.linkLinkedIn || fields.linkedin || '—'}\nWork Authorization: ${fields.workAuth || '—'}\nNotes: ${fields.motivation || fields.notes || fields.coverLetter || '—'}`;

    const html = `<h3>New job application</h3>
<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Position:</strong> ${position}</p>
<p><strong>Website:</strong> ${fields.linkPortfolio || fields.website || '—'}</p>
<p><strong>LinkedIn:</strong> ${fields.linkLinkedIn || fields.linkedin || '—'}</p>
<p><strong>Work Authorization:</strong> ${fields.workAuth || '—'}</p>
<p><strong>Notes:</strong><br>${(fields.motivation || fields.notes || fields.coverLetter || '').toString().replace(/\n/g, '<br>') || '—'}</p>`;

    if (hasSendgrid) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: process.env.SENDGRID_TO,
          from: process.env.SENDGRID_FROM,
          subject: `Job application: ${position} — ${name}`,
          text: plain,
          html,
          replyTo: email || undefined,
          attachments: [
            {
              content: file.buffer.toString('base64'),
              filename: file.filename,
              type: file.mimeType,
              disposition: 'attachment',
            },
          ],
        });
      } catch (err) {
        const sgDetails = err?.response?.body;
        console.error('SendGrid error (apply):', { message: err?.message, code: err?.code, response: sgDetails });
        return res.status(500).json({ error: 'Email service failed', details: sgDetails });
      }
    } else {
      console.log('Application received (email not configured):', {
        name,
        email,
        position,
        fields,
        file: file?.filename,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Resume file is too large (max 4 MB).' });
    }
    console.error('Apply API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


