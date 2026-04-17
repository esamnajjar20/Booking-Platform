import { Router } from 'express';
import authRoutes from './auth.routes';
import servicesRoutes from './services.routes';
import bookingsRoutes from './bookings.routes';

const router = Router();
router.use('/auth', authRoutes);
router.use('/services', servicesRoutes);
router.use('/bookings', bookingsRoutes);
export default router;