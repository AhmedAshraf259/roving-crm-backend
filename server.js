require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// الاتصال بقاعدة البيانات السحابية الخاصة بك
const MONGO_URI = "mongodb://ahmedashraf88513_db_user:68mcJLbyolkGSsAh@cluster0-shard-00-00.ht4llir.mongodb.net:27017,cluster0-shard-00-01.ht4llir.mongodb.net:27017,cluster0-shard-00-02.ht4llir.mongodb.net:27017/?ssl=true&replicaSet=atlas-12345-shard-0&authSource=admin&retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح'))
  .catch(err => console.error('خطأ في الاتصال بقاعدة البيانات:', err));

// تصميم هيكل بيانات العميل (Schema)
const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
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
    res.status(400).json({ error: 'خطأ في حفظ العميل' });
  }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
