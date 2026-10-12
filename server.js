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
  const result = { ...doc, id: doc.recordKey ?? String(doc._id), _id: String(doc._id) };
  delete result.recordKey;
  // Passwords are never returned from the API.
  delete result.pass;
  delete result.password;
  return result;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

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
    await collection.updateOne({ recordKey }, { $set: data }, { upsert: true });
    const saved = await collection.findOne({ recordKey });
    res.status(200).json(publicRecord(saved));
  } catch (err) {
    res.status(400).json({ error: 'Could not save record', details: err.message });
  }
});

app.put('/api/:collection/:id', async (req, res) => {
  try {
    const collection = collectionFor(req.params.collection);
    const key = String(req.params.id);
    const data = { ...(req.body || {}) };
    delete data._id;
    delete data.pass;
    delete data.password;
    let query;
    if (mongoose.Types.ObjectId.isValid(key)) {
      query = { $or: [{ recordKey: key }, { _id: new mongoose.Types.ObjectId(key) }] };
    } else {
      query = { $or: [{ recordKey: key }, { id: /^\d+$/.test(key) ? Number(key) : key }] };
    }
    const existing = await collection.findOne(query);
    const recordKey = existing?.recordKey ?? key;
    const target = existing ? { _id: existing._id } : { recordKey };
    await collection.updateOne(target, { $set: { ...data, recordKey } }, { upsert: true });
    res.json(publicRecord(await collection.findOne(target)));
  } catch (err) {
    res.status(400).json({ error: 'Could not update record', details: err.message });
  }
});

app.delete('/api/:collection/:id', async (req, res) => {
  try {
    const collection = collectionFor(req.params.collection);
    const key = String(req.params.id);
    let result = await collection.deleteOne({ recordKey: key });
    if (!result.deletedCount && mongoose.Types.ObjectId.isValid(key)) {
      result = await collection.deleteOne({ _id: new mongoose.Types.ObjectId(key) });
    }
    if (!result.deletedCount) {
      await collection.deleteOne({ id: /^\d+$/.test(key) ? Number(key) : key });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Could not delete record', details: err.message });
  }
});

let mailTransport = null;
function getMailTransport() {
  if (mailTransport) return mailTransport;
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
    console.warn('Email scheduler is idle: configure SMTP_HOST, SMTP_USER and SMTP_PASS.');
    return;
  }
  checkDueFollowups();
  setInterval(checkDueFollowups, 60 * 1000);
  console.log('Follow-up email scheduler started (checks every minute).');
}

app.listen(PORT, () => console.log(`Roving CRM backend listening on port ${PORT}`));
