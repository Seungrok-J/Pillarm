import app from './app';
import { initFcm } from './services/fcmService';

const PORT = process.env.PORT ?? 3000;

initFcm();

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
