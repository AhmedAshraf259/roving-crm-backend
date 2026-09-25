require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(cors());

const MONGO_URI = process.env.MONGO_URL;
if (!MONGO_URI) console.warn('WARNING: MONGO_URL is not set. Set it in Render Environment Variables.');

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Atlas connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

const clientSchema = new mongoose.Schema({
  name:{type:String,required:true}, phone:String, passport:String, source:String,
  assignedTo:String, status:{type:String,default:'جديد'}, notes:String
},{timestamps:true});

const supplierSchema = new mongoose.Schema({
  name:{type:String,required:true}, type:String, currency:{type:String,default:'USD'}, contact:String, notes:String
},{timestamps:true});

const bookingSchema = new mongoose.Schema({
  clientId:String, clientName:String, clientPhone:String,
  category:{type:String,required:true}, peopleCount:{type:Number,default:1}, currency:{type:String,default:'EGP'},
  netPrice:{type:Number,default:0}, costPrice:{type:Number,default:0}, paidAmount:{type:Number,default:0},
  remaining:{type:Number,default:0}, profit:{type:Number,default:0}, status:String, assignedTo:String,
  details:String, notes:String, packageCosts:{type:Array,default:[]}
},{timestamps:true});

const followupSchema = new mongoose.Schema({
  clientId:String, clientName:String, clientPhone:String, type:String, status:String,
  dateTime:String, assignedTo:String, priority:String, notes:String, notified:{type:Boolean,default:false}
},{timestamps:true});

const Client = mongoose.model('Client', clientSchema);
const Supplier = mongoose.model('Supplier', supplierSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Followup = mongoose.model('Followup', followupSchema);

const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const cleanId = (obj) => { const x=obj.toObject ? obj.toObject() : {...obj}; x.id=x._id?.toString(); return x; };

app.get('/api/health',(req,res)=>res.json({ok:true,service:'roving-crm-backend'}));

// Clients
app.get('/api/clients', asyncRoute(async(req,res)=>res.json((await Client.find().sort({createdAt:-1})).map(cleanId))));
app.post('/api/clients', asyncRoute(async(req,res)=>res.status(201).json(cleanId(await new Client(req.body).save()))));
app.put('/api/clients/:id', asyncRoute(async(req,res)=>res.json(cleanId(await Client.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true})) )));
app.delete('/api/clients/:id', asyncRoute(async(req,res)=>{await Client.findByIdAndDelete(req.params.id);res.json({ok:true});}));

// Suppliers
app.get('/api/suppliers', asyncRoute(async(req,res)=>res.json((await Supplier.find().sort({createdAt:-1})).map(cleanId))));
app.post('/api/suppliers', asyncRoute(async(req,res)=>res.status(201).json(cleanId(await new Supplier(req.body).save()))));
app.put('/api/suppliers/:id', asyncRoute(async(req,res)=>res.json(cleanId(await Supplier.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true})) )));
app.delete('/api/suppliers/:id', asyncRoute(async(req,res)=>{await Supplier.findByIdAndDelete(req.params.id);res.json({ok:true});}));

// Bookings
app.get('/api/bookings', asyncRoute(async(req,res)=>res.json((await Booking.find().sort({createdAt:-1})).map(cleanId))));
app.post('/api/bookings', asyncRoute(async(req,res)=>res.status(201).json(cleanId(await new Booking(req.body).save()))));
app.put('/api/bookings/:id', asyncRoute(async(req,res)=>res.json(cleanId(await Booking.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true})) )));
app.delete('/api/bookings/:id', asyncRoute(async(req,res)=>{await Booking.findByIdAndDelete(req.params.id);res.json({ok:true});}));

// Follow-ups
app.get('/api/followups', asyncRoute(async(req,res)=>res.json((await Followup.find().sort({createdAt:-1})).map(cleanId))));
app.post('/api/followups', asyncRoute(async(req,res)=>res.status(201).json(cleanId(await new Followup(req.body).save()))));
app.put('/api/followups/:id', asyncRoute(async(req,res)=>res.json(cleanId(await Followup.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true})) )));
app.delete('/api/followups/:id', asyncRoute(async(req,res)=>{await Followup.findByIdAndDelete(req.params.id);res.json({ok:true});}));

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error',details:err.message});});
const PORT=process.env.PORT||10000;
app.listen(PORT,()=>console.log(`Roving CRM API listening on ${PORT}`));
