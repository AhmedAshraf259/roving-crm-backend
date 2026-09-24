const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// إعدادات Middleware الأساسية
app.use(express.json());
app.use(cors());

// الاتصال بقاعدة بيانات MongoDB باستخدام متغير البيئة MONGO_URL
const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("Connected to MongoDB successfully!"))
.catch(err => console.error("MongoDB connection error:", err));

// تعريف نموذج (Schema) للعملاء
const clientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: String,
    passport: String,
    source: { type: String, required: true },
    status: { type: String, required: true },
    assignedTo: String,
    notes: String
}, { timestamps: true });

const Client = mongoose.model('Client', clientSchema);

// مسار لجلب جميع العملاء
app.get('/api/clients', async (req, res) => {
    try {
        const clients = await Client.find().sort({ createdAt: -1 });
        res.json(clients);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// مسار لإضافة عميل جديد
app.post('/api/clients', async (req, res) => {
    try {
        const newClient = new Client(req.body);
        const savedClient = await newClient.save();
        res.status(201).json(savedClient);
    } catch (error) {
        res.status(400).json({ error: 'Failed to save client' });
    }
});

// تشغيل السيرفر على المنفذ المتاح أو المنفذ الافتراضي لـ Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
