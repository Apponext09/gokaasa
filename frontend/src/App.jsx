import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { CustomerLayout } from '@/layouts/CustomerLayout.jsx';
import { AdminLayout } from '@/layouts/AdminLayout.jsx';
import { RequireAuth } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { HomePage } from '@/pages/customer/HomePage.jsx';
import { DestinationsPage } from '@/pages/customer/DestinationsPage.jsx';
import { WishlistPage } from '@/pages/customer/WishlistPage.jsx';
import { NearbyHotelsPage } from '@/pages/customer/NearbyHotelsPage.jsx';
import { AboutPage } from '@/pages/customer/AboutPage.jsx';
import { ContactPage } from '@/pages/customer/ContactPage.jsx';
import { ProfilePage } from '@/pages/customer/ProfilePage.jsx';
import { SearchResultsPage } from '@/pages/customer/SearchResultsPage.jsx';
import { HotelDetailsPage } from '@/pages/customer/HotelDetailsPage.jsx';
import { GuestDetailsPage } from '@/pages/customer/booking/GuestDetailsPage.jsx';
import { BookingReviewPage } from '@/pages/customer/booking/BookingReviewPage.jsx';
import { BookingConfirmationPage } from '@/pages/customer/booking/BookingConfirmationPage.jsx';
import { MyTripsPage } from '@/pages/customer/booking/MyTripsPage.jsx';
import { BookingDetailsPage } from '@/pages/customer/booking/BookingDetailsPage.jsx';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/AuthPages.jsx';
import { DashboardPage } from '@/pages/admin/DashboardPage.jsx';
import { HotelListPage } from '@/pages/admin/HotelListPage.jsx';
import { HotelOnboardingPage } from '@/pages/admin/HotelOnboardingPage.jsx';
import { HotelEditorPage } from '@/pages/admin/HotelEditorPage.jsx';
import { ImportReviewPage } from '@/pages/admin/ImportReviewPage.jsx';
import { RoomsPage } from '@/pages/admin/RoomsPage.jsx';
import { RoomEditorPage } from '@/pages/admin/RoomEditorPage.jsx';
import { BookingsPage } from '@/pages/admin/BookingsPage.jsx';
import { BookingDetailPage } from '@/pages/admin/BookingDetailPage.jsx';
import { PaymentsPage } from '@/pages/admin/PaymentsPage.jsx';
import { RefundsPage } from '@/pages/admin/RefundsPage.jsx';
import { CustomersPage } from '@/pages/admin/CustomersPage.jsx';
import { CustomerDetailPage } from '@/pages/admin/CustomerDetailPage.jsx';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage.jsx';
import { ReviewsPage } from '@/pages/admin/ReviewsPage.jsx';

function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="text-2xl font-semibold text-[var(--text-strong)]">We could not find that page</h1>
      <p className="text-sm text-[var(--text-muted)]">The link may be out of date, or the page has moved.</p>
      <Link to="/">
        <Button variant="secondary">Back to home</Button>
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="destinations" element={<DestinationsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        {/* Static segments ("nearby") must be declared before the dynamic ":destination", otherwise it is read as one. */}
        <Route path="hotels/nearby" element={<NearbyHotelsPage />} />
        <Route path="hotels/:destination" element={<SearchResultsPage />} />
        <Route path="hotels/:citySlug/:hotelSlug" element={<HotelDetailsPage />} />

        {/* Booking, My Trips, the wishlist and the profile belong to a signed-in guest. Signed-out visitors go to sign-in and come back here. */}
        <Route element={<RequireAuth />}>
          <Route path="booking/guest-details" element={<GuestDetailsPage />} />
          <Route path="booking/review" element={<BookingReviewPage />} />
          <Route path="booking/confirmation/:bookingId" element={<BookingConfirmationPage />} />
          <Route path="my-trips" element={<MyTripsPage />} />
          <Route path="my-trips/:bookingId" element={<BookingDetailsPage />} />
          <Route path="wishlist" element={<WishlistPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="admin"
        element={
          <RequireAuth staff>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="hotels" element={<HotelListPage />} />
        {/* Static segments must be declared before ":id" so "onboarding" and "new" are not read as ids. */}
        <Route path="hotels/onboarding" element={<HotelOnboardingPage />} />
        <Route path="hotels/onboarding/:importId/review" element={<ImportReviewPage />} />
        <Route path="hotels/new" element={<HotelEditorPage />} />
        <Route path="hotels/:id" element={<HotelEditorPage />} />
        <Route path="hotels/:hotelId/rooms" element={<RoomsPage />} />
        <Route path="hotels/:hotelId/rooms/new" element={<RoomEditorPage />} />
        <Route path="hotels/:hotelId/rooms/:roomId" element={<RoomEditorPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="refunds" element={<RefundsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="audit-logs" element={<AuditLogsPage />} />
      </Route>
    </Routes>
  );
}
