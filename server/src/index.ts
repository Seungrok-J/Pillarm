import app from './app';
import { initFcm } from './services/fcmService';
import { startMissedDoseNotifier } from './services/missedDoseNotifier';

const PORT = process.env.PORT ?? 3000;

initFcm();
startMissedDoseNotifier();

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
