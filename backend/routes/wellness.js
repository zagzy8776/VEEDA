import { Router } from 'express';
import sql from '../db.js';
const router = Router();

router.get('/wellness-history', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const { rows } = await sql.query(
    `SELECT type, value, unit, timestamp FROM biometric_events WHERE timestamp >= NOW() - ($1 || ' days')::interval ORDER BY timestamp DESC LIMIT 100`,
    [days]
  );
  res.json(rows);
});

router.post('/wellness-event', async (req, res) => {
  const { eventType, message, vitals, analysis, wellnessScore, profile } = req.body;
  if (eventType !== 'chat') return res.json({ ok: true });

  const name = profile?.name || 'there';
  const m = (message || '').toLowerCase();
  let reply = '';

  if (m.includes('heart') || m.includes('bpm') || m.includes('pulse')) {
    const hr = vitals?.heartRate;
    if (!hr) reply = `No heart rate measured yet, ${name}. Go to Vitals and tap Heart Rate to measure with your camera.`;
    else if (hr > 120) reply = `⚠ ${name}, your heart rate is ${hr} bpm — critically elevated. Sit down, breathe slowly, and seek medical attention if it stays above 120 for more than 10 minutes.`;
    else if (hr > 100) reply = `Your heart rate is ${hr} bpm — slightly elevated. Rest and take slow deep breaths.`;
    else if (hr < 50) reply = `Your heart rate is ${hr} bpm — below normal. Monitor closely and seek medical advice if you feel dizzy or faint.`;
    else reply = `Your heart rate is ${hr} bpm — healthy resting range (60–100 bpm). Looking good, ${name}!`;
  } else if (m.includes('breath') || m.includes('respiratory')) {
    const br = vitals?.respiratory;
    if (!br) reply = `No breath rate measured yet. Go to Vitals and tap Breath Rate.`;
    else if (br > 24) reply = `⚠ Your breathing rate is ${br} br/min — elevated. If you feel short of breath, seek medical help immediately.`;
    else reply = `Your breathing rate is ${br} br/min — within normal range (12–20). You're breathing well.`;
  } else if (m.includes('water') || m.includes('hydrat')) {
    const h = vitals?.hydration;
    if (!h) reply = `No hydration logged yet. Tap +250ml or +500ml in Vitals whenever you drink.`;
    else reply = `Hydration is at ${h}%. ${h < 50 ? 'Drink water now — you are significantly under target.' : h < 80 ? 'Getting there. Keep drinking regularly.' : `Great hydration, ${name}!`}`;
  } else if (m.includes('score') || m.includes('wellness')) {
    if (wellnessScore === null) reply = `No wellness score yet — measure at least one vital to calculate yours.`;
    else reply = `Your wellness score is ${wellnessScore}/100. ${wellnessScore >= 80 ? 'Excellent!' : wellnessScore >= 60 ? 'Good, but keep tracking.' : 'Needs attention — focus on rest and hydration.'}`;
  } else if (m.includes('emergency') || m.includes('help') || m.includes('sos')) {
    reply = `For emergencies, go to the Map tab and tap the red Emergency SOS button to call 112 immediately.`;
  } else if (m.includes('focus') || m.includes('today') || m.includes('improve')) {
    const tips = [];
    if (!vitals?.heartRate) tips.push('Measure your heart rate (camera)');
    if (!vitals?.respiratory) tips.push('Check your breathing rate (microphone)');
    if ((vitals?.hydration ?? 0) < 75) tips.push('Drink more water');
    if (!vitals?.skinTemp) tips.push('Log your temperature');
    reply = tips.length ? `Focus for today, ${name}:\n${tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : `You are doing great, ${name}! All vitals tracked. Keep logging throughout the day.`;
  } else {
    const riskNote = analysis?.riskLevel && analysis.riskLevel !== 'Stable' ? ` Current risk level: ${analysis.riskLevel}.` : '';
    reply = `I am here to help you monitor your wellness, ${name}.${riskNote} Ask me about your heart rate, breathing, hydration, temperature, score, or what to focus on today. For emergencies use the SOS button on the Map tab.`;
  }

  res.json({ conversationReply: reply });
});

export default router;
