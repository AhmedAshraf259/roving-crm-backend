require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());

const MONGO_URI = process.env.MONGO_URL;
if (!MONGO_URI) {
  console.error('MONGO_URL is not configured. Set it in Render Environment Variables.');
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح'))
  .catch(err => console.error('خطأ في الاتصال بقاعدة البيانات:', err));

// Existing clients collection
const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  passport: String,
  source: String,
  assignedTo: String,
  status: { type: String, default: 'جديد' },
  notes: String,
  createdAt: { type: Date, default: Date.now }
});
const Client = mongoose.model('Client', clientSchema);

// Generic CRM record storage. The frontend keeps its existing object shape;
// MongoDB stores that object in `data` and uses `recordId` as the stable ID.
const recordSchema = new mongoose.Schema({
  recordId: { type: String, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { minimize: false });

function makeModel(name) {
  return mongoose.models[name] || mongoose.model(name, recordSchema);
}

const Booking = makeModel('Booking');
const Supplier = makeModel('Supplier');
const Followup = makeModel('Followup');
const Notification = makeModel('Notification');
const Approval = makeModel('Approval');
const Broadcast = makeModel('Broadcast');

function cleanRecord(doc) {
  if (!doc) return null;
  return { ...(doc.data || {}), id: doc.data?.id ?? doc.recordId };
}

function registerCrud(path, Model) {
  app.get(`/api/${path}`, async (req, res) => {
    try {
      const docs = await Model.find().sort({ updatedAt: -1, createdAt: -1 });
      res.json(docs.map(cleanRecord));
    } catch (err) {
      console.error(`GET /api/${path}`, err);
      res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
  });

  app.post(`/api/${path}`, async (req, res) => {
    try {
      const data = req.body || {};
      const recordId = String(data.id || data._id || `${path}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      const saved = await Model.findOneAndUpdate(
        { recordId },
        { recordId, data: { ...data, id: recordId }, updatedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      res.status(201).json(cleanRecord(saved));
    } catch (err) {
      console.error(`POST /api/${path}`, err);
      res.status(400).json({ error: 'خطأ في حفظ البيانات', details: err.message });
    }
  });

  app.put(`/api/${path}/:id`, async (req, res) => {
    try {
      const recordId = String(req.params.id);
      const saved = await Model.findOneAndUpdate(
        { recordId },
        { recordId, data: { ...(req.body || {}), id: recordId }, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      res.json(cleanRecord(saved));
    } catch (err) {
      console.error(`PUT /api/${path}/${req.params.id}`, err);
      res.status(400).json({ error: 'خطأ في تحديث البيانات', details: err.message });
    }
  });

  app.delete(`/api/${path}/:id`, async (req, res) => {
    try {
      await Model.deleteOne({ recordId: String(req.params.id) });
      res.json({ ok: true });
    } catch (err) {
      console.error(`DELETE /api/${path}/${req.params.id}`, err);
      res.status(500).json({ error: 'خطأ في حذف البيانات' });
    }
  });
}

registerCrud('bookings', Booking);
registerCrud('suppliers', Supplier);
registerCrud('followups', Followup);
registerCrud('notifications', Notification);
registerCrud('approvals', Approval);
registerCrud('broadcast', Broadcast);

// Existing Clients APIs
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب البيانات' });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const newClient = new Client(req.body);
    const savedClient = await newClient.save();
    res.status(201).json(savedClient);
  } catch (err) {
    res.status(400).json({ error: 'خطأ في حفظ العميل', details: err.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'العميل غير موجود' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'خطأ في تحديث العميل', details: err.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'خطأ في حذف العميل', details: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`السيرفر يعمل على المنفذ ${PORT}`));
