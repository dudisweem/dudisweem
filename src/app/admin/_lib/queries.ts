import "server-only";
import type { BookingStatus, Payment } from "@/domain/labels";

/** Booking row with joined student/parent/service/instructor, as the admin pages render it. */
export type AdminBooking = {
  id: string;
  number: number;
  series_id?: string | null;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  price_agorot: number;
  payment_method: Payment;
  paid: boolean;
  parent_note: string;
  staff_note: string;
  lesson_report: string;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    color: string;
    health_signed_at: string | null;
    parent: { full_name: string; phone: string; email: string } | null;
  } | null;
  service: { id: string; name: string; capacity: number } | null;
  instructor: { id: string; full_name: string; color: string } | null;
};

export const BOOKING_SELECT = `
  id, number, starts_at, ends_at, status, price_agorot, payment_method, paid, parent_note, staff_note, lesson_report, created_at, series_id,
  student:students!bookings_student_id_fkey ( id, first_name, last_name, color, health_signed_at,
    parent:profiles!students_parent_id_fkey ( full_name, phone, email ) ),
  service:services!bookings_service_id_fkey ( id, name, capacity ),
  instructor:profiles!bookings_instructor_id_fkey ( id, full_name, color )
`;

export function kidName(b: AdminBooking) {
  return b.student ? `${b.student.first_name} ${b.student.last_name}`.trim() : "—";
}
