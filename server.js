require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Configure MONGO_URL and SMTP settings as environment variables on your hosting provider.
if (!process.env.MONGO_URL) {
  console.error('MONGO_URL is missing. Add it to your environment variables.');
}

mongoose.connect(process.env.MONGO_URL || '')
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    startFollowupEmailScheduler();
  })
  .catch(err => console.error('MongoDB connection error:', err.message));

const PORT = process.env.PORT || 10000;
const ALLOWED_COLLECTIONS = new Set([
  'clients', 'followups', 'bookings', 'suppliers', 'users', 'approvals', 'notifications'
]);

function collectionFor(name) {
  if (!ALLOWED_COLLECTIONS.has(name)) throw new Error('Unsupported collection');
  return mongoose.connection.collection(name);
}

function recordKeyOf(record) {
  const value = record?.id ?? record?._id ?? record?.email;
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value);
}

function publicRecord(doc) {
  if (!doc) return doc;
  const result = { ...doc, id: doc.recordKey ?? String(doc._id) };
  delete result.recordKey;
  delete result._id;
  // Passwords are never returned from the API.
  delete result.pass;
  delete result.password;
  return result;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/health/mail', async (_req, res) => {
  const usingResend = Boolean(String(process.env.RESEND_API_KEY || '').trim());
  const configured = usingResend || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const recipients = await getAdminEmailRecipients();

  // A send-only Resend key is not allowed to GET /domains. Do not treat that
  // permission denial as proof that sending is broken; the POST test below
  // is the real end-to-end check.
  if (usingResend) {
    return res.status(configured ? 200 : 503).json({
      ok: false,
      emailConfigured: true,
      emailProviderVerified: false,
      verificationMode: 'send_test_required',
      smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      smtpVerified: false,
      adminRecipientsFound: recipients.length,
      reason: 'Resend send-only keys cannot verify by listing domains. Run the protected email test to verify actual delivery.'
    });
  }

  const result = await verifyMailSetup();
  res.status(result.verified ? 200 : 503).json({
    ok: result.verified,
    emailConfigured: result.configured,
    emailProviderVerified: result.verified,
    smtpConfigured: result.configured,
    smtpVerified: result.verified,
    adminRecipientsFound: recipients.length,
    reason: result.reason || null
  });
});

// Send an explicit end-to-end test email to all admin recipients.
// Set EMAIL_TEST_TOKEN in Render and send it in x-email-test-token header.
app.post('/api/email/test', async (req, res) => {
  const expected = String(process.env.EMAIL_TEST_TOKEN || '');
  const provided = String(req.get('x-email-test-token') || '');
  if (!expected || provided !== expected) return res.status(401).json({ error: 'Unauthorized email test request' });
  const usingResend = Boolean(String(process.env.RESEND_API_KEY || '').trim());
  if (!usingResend) {
    const setup = await verifyMailSetup();
    if (!setup.verified) return res.status(503).json({ error: 'SMTP is not ready', details: setup.reason || 'SMTP verification failed' });
  }
  const recipients = await getAdminEmailRecipients();
  if (!recipients.length) return res.status(400).json({ error: 'No admin email recipients found. Add ADMIN_EMAILS or admin user emails.' });
  try {
    await getMailTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject: 'Roving CRM — Email delivery test',
      text: `This is a test email from Roving CRM. The backend successfully submitted this message to the configured email provider. Sent at ${new Date().toISOString()}.`,
      html: `<p>This is a test email from <b>Roving CRM</b>.</p><p>The backend successfully submitted this message to the configured email provider.</p><p>Sent at ${htmlEscape(new Date().toISOString())}.</p>`
    });
    console.log(`Test email sent to ${recipients.length} admin recipient(s).`);
    res.json({ ok: true, sent: true, adminRecipientsFound: recipients.length });
  } catch (err) {
    console.error('Email test failed:', err.message);
    res.status(502).json({ error: 'Could not send test email', details: err.message });
  }
});

app.get('/api/:collection', async (req, res) => {
  try {
    const collection = collectionFor(req.params.collection);
    const docs = await collection.find({}).sort({ createdAt: -1, _id: -1 }).toArray();
    res.json(docs.map(publicRecord));
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch records', details: err.message });
  }
});

// The frontend saves records using POST for both new and updated records.
app.post('/api/:collection', async (req, res) => {
  try {
    const collection = collectionFor(req.params.collection);
    const data = { ...(req.body || {}) };
    const recordKey = recordKeyOf(data);
    if (!recordKey) return res.status(400).json({ error: 'Record must include id or email' });
    delete data._id;
    delete data.pass;
    delete data.password;
    data.recordKey = recordKey;
    if (!data.createdAt) data.createdAt = new Date();
    const previous = await collection.findOne({ recordKey });
    await collection.updateOne({ recordKey }, { $set: data }, { upsert: true });
    const saved = await collection.findOne({ recordKey });
    res.status(200).json(publicRecord(saved));
    if (['clients', 'followups', 'bookings', 'suppliers', 'users', 'approvals', 'notifications'].includes(req.params.collection)) {
      void sendAdminActivityEmail({
        collectionName: req.params.collection,
        action: req.params.collection === 'notifications' ? 'notification' : (previous ? 'update' : 'create'),
        record: saved,
        previous
      });
    }
  } catch (err) {
    res.status(400).json({ error: 'Could not save record', details: err.message });
  }
});

app.put('/api/:collection/:id', async (req, res) => {
  try {
    const collection = collectionFor(req.params.collection);
    const data = { ...(req.body || {}), recordKey: String(req.params.id) };
    delete data._id;
    delete data.pass;
    delete data.password;
    const key = String(req.params.id);
    const previous = await collection.findOne({ recordKey: key });
    await collection.updateOne({ recordKey: key }, { $set: data }, { upsert: true });
    const saved = await collection.findOne({ recordKey: key });
    res.json(publicRecord(saved));
    if (['clients', 'followups', 'bookings', 'suppliers', 'users', 'approvals', 'notifications'].includes(req.params.collection)) {
      void sendAdminActivityEmail({
        collectionName: req.params.collection,
        action: req.params.collection === 'notifications' ? 'notification' : (previous ? 'update' : 'create'),
        record: saved,
        previous
      });
    }
  } catch (err) {
    res.status(400).json({ error: 'Could not update record', details: err.message });
  }
});

app.delete('/api/:collection/:id', async (req, res) => {
  try {
    const collection = collectionFor(req.params.collection);
    const key = String(req.params.id);
    const result = await collection.deleteOne({ recordKey: key });
    // Support older records which were stored without recordKey.
    if (!result.deletedCount) {
      await collection.deleteOne({ id: /^\d+$/.test(key) ? Number(key) : key });
    }
    res.json({ ok: true });
    if (['clients', 'followups', 'bookings', 'suppliers', 'users', 'approvals', 'notifications'].includes(req.params.collection)) {
      void sendAdminActivityEmail({
        collectionName: req.params.collection,
        action: 'delete',
        record: { id: key, name: req.params.collection },
        previous: null
      });
    }
  } catch (err) {
    res.status(400).json({ error: 'Could not delete record', details: err.message });
  }
});

let mailTransport = null;
function getMailTransport() {
  if (mailTransport) return mailTransport;

  // Prefer Resend's HTTPS API. This avoids SMTP port restrictions on some hosting plans.
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (resendApiKey) {
    mailTransport = {
      async verify() {
        const response = await fetch('https://api.resend.com/domains', {
          method: 'GET',
          headers: { Authorization: `Bearer ${resendApiKey}` }
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Resend verification failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ''}`);
        }
        return true;
      },
      async sendMail(message) {
        const to = Array.isArray(message.to)
          ? message.to
          : String(message.to || '').split(',').map(value => value.trim()).filter(Boolean);
        const payload = {
          from: message.from || process.env.MAIL_FROM,
          to,
          subject: message.subject || 'Roving CRM notification',
          text: message.text || undefined,
          html: message.html || undefined
        };
        if (!payload.from) throw new Error('MAIL_FROM is required for Resend.');
        if (!payload.to.length) throw new Error('At least one recipient is required.');
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const bodyText = await response.text();
        let body;
        try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (_) { body = { message: bodyText }; }
        if (!response.ok) {
          const detail = body.message || body.error || body.name || `HTTP ${response.status}`;
          throw new Error(`Resend API error (${response.status}): ${detail}`);
        }
        return { messageId: body.id || null, response: body };
      }
    };
    return mailTransport;
  }

  // Legacy SMTP fallback for environments that allow outbound SMTP.
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  mailTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return mailTransport;
}

function normalize(value) { return String(value || '').trim().toLowerCase(); }
function dateText(value) {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-GB', { timeZone: process.env.CRM_TIMEZONE || 'Africa/Cairo' });
}
function htmlEscape(value) {
  return String(value ?? '—').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

async function getAdminEmailRecipients() {
  const recipients = new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(/[;,]/).map(value => value.trim()).filter(Boolean).map(normalize)
  );
  if (mongoose.connection.readyState === 1) {
    try {
      const users = await collectionFor('users').find({}).toArray();
      for (const user of users) {
        if (normalize(user.role) === 'admin' && user.email) recipients.add(normalize(user.email));
      }
    } catch (err) {
      console.warn('Could not load admin email recipients:', err.message);
    }
  }
  return [...recipients].filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function safeSummary(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function sendAdminActivityEmail({ collectionName, action, record, previous }) {
  // Email notifications cover changes and CRM notifications, not read requests.
  const transport = getMailTransport();
  if (!transport) {
    console.warn(`Admin activity email skipped (${collectionName}/${action}): email provider is not configured.`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  const recipients = await getAdminEmailRecipients();
  if (!recipients.length) {
    console.warn(`Admin activity email skipped (${collectionName}/${action}): no admin email recipients.`);
    return { sent: false, reason: 'no_admin_recipients' };
  }

  const safeRecord = { ...(record || {}) };
  delete safeRecord.password; delete safeRecord.pass; delete safeRecord._id; delete safeRecord.recordKey;
  const safePrevious = previous ? { ...previous } : null;
  if (safePrevious) {
    delete safePrevious.password; delete safePrevious.pass; delete safePrevious._id; delete safePrevious.recordKey;
  }

  const label = safeRecord.clientName || safeRecord.name || safeRecord.title ||
    safeRecord.email || safeRecord.id || 'CRM record';
  const fields = new Set([...Object.keys(safePrevious || {}), ...Object.keys(safeRecord)]);
  const changes = [];
  for (const field of fields) {
    if (['createdAt', 'updatedAt', 'notifiedAt'].includes(field)) continue;
    const before = safePrevious ? safeSummary(safePrevious[field]) : '(new)';
    const after = safeSummary(safeRecord[field]);
    if (!safePrevious || before !== after) changes.push({ field, before, after });
  }
  const details = changes.slice(0, 30);
  const detailsText = details.map(item => `${item.field}: ${item.before} → ${item.after}`).join('\\n') || 'A CRM activity/notification was recorded.';
  const detailsHtml = details.map(item =>
    `<tr><th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f5f5f5">${htmlEscape(item.field)}</th><td style="padding:8px;border:1px solid #ddd">${htmlEscape(item.before)}</td><td style="padding:8px;border:1px solid #ddd">${htmlEscape(item.after)}</td></tr>`
  ).join('');
  const actionText = ({ create: 'Created', update: 'Updated', delete: 'Deleted', notification: 'Notification' })[action] || action;
  const subject = `[Roving CRM] ${actionText}: ${collectionName} — ${label}`;
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject,
      text: `A CRM activity occurred.\\nCollection: ${collectionName}\\nAction: ${actionText}\\nRecord: ${label}\\n\\n${detailsText}`,
      html: `<div style="font-family:Arial,sans-serif"><h2>Roving CRM — Admin Activity Alert</h2><p>A change or notification was recorded in the CRM.</p><p><b>Section:</b> ${htmlEscape(collectionName)}<br><b>Action:</b> ${htmlEscape(actionText)}<br><b>Record:</b> ${htmlEscape(label)}</p><table style="border-collapse:collapse;width:100%;max-width:900px"><thead><tr><th style="padding:8px;border:1px solid #ddd">Field</th><th style="padding:8px;border:1px solid #ddd">Before</th><th style="padding:8px;border:1px solid #ddd">After</th></tr></thead><tbody>${detailsHtml || '<tr><td colspan="3">A CRM activity/notification was recorded.</td></tr>'}</tbody></table></div>`
    });
    console.log(`Admin activity email sent: ${collectionName}/${action} to ${recipients.length} admin recipient(s).`);
    return { sent: true };
  } catch (err) {
    console.error(`Admin activity email failed (${collectionName}/${action}):`, err.message);
    return { sent: false, reason: err.message };
  }
}

async function verifyMailSetup() {
  const transport = getMailTransport();
  if (!transport) return { configured: false, verified: false, reason: 'Configure RESEND_API_KEY (recommended) or SMTP_HOST, SMTP_USER, SMTP_PASS.' };
  try {
    await transport.verify();
    return { configured: true, verified: true };
  } catch (err) {
    console.error('Email provider verification failed:', err.message);
    return { configured: true, verified: false, reason: err.message };
  }
}

async function checkDueFollowups() {
  const transport = getMailTransport();
  if (!transport || mongoose.connection.readyState !== 1) return;
  try {
    const followupsCollection = collectionFor('followups');
    const usersCollection = collectionFor('users');
    const clientsCollection = collectionFor('clients');
    const now = new Date();
    const due = await followupsCollection.find({
      status: { $nin: ['Completed', 'Lose', 'Lost'] },
      notified: { $ne: true },
      dateTime: { $exists: true, $ne: '' }
    }).toArray();
    if (!due.length) return;
    const users = await usersCollection.find({}).toArray();
    const adminEmailsFromEnv = String(process.env.ADMIN_EMAILS || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
    const adminEmails = new Set(adminEmailsFromEnv.map(normalize));
    for (const user of users) {
      if (normalize(user.role) === 'admin' && user.email) adminEmails.add(normalize(user.email));
    }

    for (const followup of due) {
      const when = new Date(followup.dateTime);
      if (Number.isNaN(when.getTime()) || when > now) continue;
      const assigned = normalize(followup.assignedTo);
      const assignedUser = users.find(u => normalize(u.name) === assigned || normalize(u.email) === assigned);
      const recipients = new Set(adminEmails);
      if (assignedUser?.email) recipients.add(normalize(assignedUser.email));
      if (!recipients.size) {
        console.warn(`No email recipients configured for due follow-up ${followup.recordKey || followup.id || followup._id}`);
        continue;
      }

      const clientKey = followup.clientId === undefined || followup.clientId === null ? '' : String(followup.clientId);
      const client = clientKey ? await clientsCollection.findOne({ $or: [{ recordKey: clientKey }, { id: /^\d+$/.test(clientKey) ? Number(clientKey) : clientKey }] }) : null;
      const clientName = followup.clientName || client?.name || followup.name || 'Not specified';
      const subject = `Roving CRM Follow-up Due: ${clientName}`;
      const rows = [
        ['Client Name', clientName], ['Phone', followup.clientPhone || client?.phone || followup.phone],
        ['Email', followup.clientEmail || client?.email || followup.email], ['Lead Source', followup.source || client?.source],
        ['Assigned To', followup.assignedTo], ['Follow-up Type', followup.type],
        ['Follow-up Date & Time', dateText(followup.dateTime)], ['Priority', followup.priority],
        ['Status', followup.status], ['Last Contact', dateText(followup.lastContactAt)],
        ['Latest Result', followup.result], ['Note', followup.notes]
      ];
      const tableRows = rows.map(([label, value]) => `<tr><th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f5f5f5">${htmlEscape(label)}</th><td style="padding:8px;border:1px solid #ddd">${htmlEscape(value || '—')}</td></tr>`).join('');
      await transport.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: [...recipients].join(', '),
        subject,
        text: rows.map(([label, value]) => `${label}: ${value || '—'}`).join('\n'),
        html: `<div style="font-family:Arial,sans-serif"><h2>Roving CRM — Follow-up Reminder</h2><p>A scheduled follow-up is due.</p><table style="border-collapse:collapse;width:100%;max-width:760px">${tableRows}</table></div>`
      });
      await followupsCollection.updateOne(
        { _id: followup._id },
        { $set: { notified: true, notifiedAt: new Date() } }
      );
      console.log(`Follow-up reminder email sent for ${clientName}`);
    }
  } catch (err) {
    console.error('Follow-up email scheduler error:', err.message);
  }
}

function startFollowupEmailScheduler() {
  if (!getMailTransport()) {
    console.warn('Email scheduler is idle: configure RESEND_API_KEY (recommended) or SMTP_HOST, SMTP_USER and SMTP_PASS.');
    return;
  }
  checkDueFollowups();
  setInterval(checkDueFollowups, 60 * 1000);
  console.log('Follow-up email scheduler started (checks every minute).');
}

app.listen(PORT, () => console.log(`Roving CRM backend listening on port ${PORT}`));
