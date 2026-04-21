import { AuthService } from './auth.service';
import { BookingService } from './booking.service';
import { ServiceService } from './service.service';

export const authService = new AuthService();
export const bookingService = new BookingService();
export const serviceService = new ServiceService();

