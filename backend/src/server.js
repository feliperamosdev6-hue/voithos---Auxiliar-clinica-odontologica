const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const patientsRouter = require('./routes/patients');
const authRouter = require('./routes/auth');
const clinicRoutes = require('./routes/clinicRoutes');
const userRoutes = require('./routes/userRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const automationRoutes = require('./routes/automationRoutes');
const authRoutes = require('./routes/authRoutes');
const inboundMessageRoutes = require('./routes/inboundMessageRoutes');
const internalAutomationRoutes = require('./routes/internalAutomationRoutes');
const internalAppointmentRoutes = require('./routes/internalAppointmentRoutes');
const internalPatientClinicalRoutes = require('./routes/internalPatientClinicalRoutes');
const internalPatientRoutes = require('./routes/internalPatientRoutes');
const outboundMessageRoutes = require('./routes/outboundMessageRoutes');
const internalWhatsappRoutes = require('./routes/internalWhatsappRoutes');
const notificationEventRoutes = require('./routes/notificationEventRoutes');
const publicAppointmentActionRoutes = require('./routes/publicAppointmentActionRoutes');
const { startAppointmentReminderScheduler } = require('./services/appointmentReminderSchedulerService');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'voithos-central-backend',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/r', publicAppointmentActionRoutes);
app.use('/clinics', clinicRoutes);
app.use('/users', userRoutes);
app.use('/patients', patientRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/automation', automationRoutes);
app.use('/inbound-messages', inboundMessageRoutes);
app.use('/notifications', notificationEventRoutes);
app.use('/outbound-messages', outboundMessageRoutes);
app.use('/internal/automation', internalAutomationRoutes);
app.use('/internal/appointments', internalAppointmentRoutes);
app.use('/internal/clinical', internalPatientClinicalRoutes);
app.use('/internal/patients', internalPatientRoutes);
app.use('/internal/whatsapp', internalWhatsappRoutes);
app.use('/auth', authRoutes);
app.use('/api/patients', patientsRouter);
app.use('/api/auth', authRouter);

app.use(errorHandler);

initDb();
startAppointmentReminderScheduler();

app.listen(port, () => {
  console.log(`[backend] listening on http://127.0.0.1:${port}`);
});
