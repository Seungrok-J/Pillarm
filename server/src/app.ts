import express from 'express';
import authRouter from './routes/auth';
import socialAuthRouter from './routes/socialAuth';
import careCircleRouter from './routes/careCircle';
import doseSyncRouter from './routes/doseSync';
import syncRouter from './routes/sync';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());

app.use('/auth', authRouter);
app.use('/auth/social', socialAuthRouter);
app.use('/care-circles', careCircleRouter);
// doseSync shares the /care-circles prefix but handles /:id/members/:userId/today sub-paths
app.use('/care-circles', doseSyncRouter);
app.use('/sync', syncRouter);

app.use(errorHandler);

export default app;
