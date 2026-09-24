require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// الاتصال بقاعدة البيانات السحابية الخاصة بك
const MONGO_URI = process.env.MONGO_URL || "mongodb+srv://ahmedashraf88513_db_user:Ahmed12345678@cluster0.ht4l1ir.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI)
  .then(() => console.log('تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح'))
  .catch(err => console.error('خطأ في الاتصال بقاعدة البيانات:', err));

// تصميم هيكل بيانات العميل بدون قيود تسبب أخطاء
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

// --- API Endpoints ---
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

// تشغيل السيرفر (تم تعريفه مرة واحدة فقط هنا لتجنب أي أخطاء)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
