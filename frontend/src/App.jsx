import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { CustomerLayout } from '@/layouts/CustomerLayout.jsx';
import { AdminLayout } from '@/layouts/AdminLayout.jsx';
import { RequireAuth } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { HomePage } from '@/pages/customer/HomePage.jsx';
import { HotelsPage } from '@/pages/customer/HotelsPage.jsx';
import { DestinationsPage } from '@/pages/customer/DestinationsPage.jsx';
import { OffersPage } from '@/pages/customer/OffersPage.jsx';
import { WishlistPage } from '@/pages/customer/WishlistPage.jsx';
import { NearbyHotelsPage } from '@/pages/customer/NearbyHotelsPage.jsx';
import { AboutPage } from '@/pages/customer/AboutPage.jsx';
import { ContactPage } from '@/pages/customer/ContactPage.jsx';
import { ProfilePage } from '@/pages/customer/ProfilePage.jsx';
import { NotificationsPage } from '@/pages/customer/NotificationsPage.jsx';
import { SearchResultsPage } from '@/pages/customer/SearchResultsPage.jsx';
import { HotelDetailsPage } from '@/pages/customer/HotelDetailsPage.jsx';
import { GuestDetailsPage } from '@/pages/customer/booking/GuestDetailsPage.jsx';
import { BookingReviewPage } from '@/pages/customer/booking/BookingReviewPage.jsx';
import { BookingConfirmationPage } from '@/pages/customer/booking/BookingConfirmationPage.jsx';
import { MyTripsPage } from '@/pages/customer/booking/MyTripsPage.jsx';
import { BookingDetailsPage } from '@/pages/customer/booking/BookingDetailsPage.jsx';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/AuthPages.jsx';
import { PartnerRegisterPage } from '@/pages/partner/PartnerRegisterPage.jsx';
import { PartnerOtpPage } from '@/pages/partner/PartnerOtpPage.jsx';
import { PartnerDocumentsPage } from '@/pages/partner/PartnerDocumentsPage.jsx';
import { ApplicationStatusPage } from '@/pages/partner/ApplicationStatusPage.jsx';
import { PresenceTracker } from '@/features/presence/PresenceTracker.jsx';
import { ScrollToTop } from '@/components/shared/ScrollToTop.jsx';
import { lazy } from 'react';

// Lazy: none of this admin code is in the customer homepage's initial bundle, and within admin each
// module loads only when its own route is visited (the dashboard never pulls in Reports/Reviews/etc).
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage.jsx').then((m) => ({ default: m.DashboardPage })));
const HotelListPage = lazy(() => import('@/pages/admin/HotelListPage.jsx').then((m) => ({ default: m.HotelListPage })));
const HotelOnboardingPage = lazy(() => import('@/pages/admin/HotelOnboardingPage.jsx').then((m) => ({ default: m.HotelOnboardingPage })));
const HotelEditorPage = lazy(() => import('@/pages/admin/HotelEditorPage.jsx').then((m) => ({ default: m.HotelEditorPage })));
const ImportReviewPage = lazy(() => import('@/pages/admin/ImportReviewPage.jsx').then((m) => ({ default: m.ImportReviewPage })));
const RoomsPage = lazy(() => import('@/pages/admin/RoomsPage.jsx').then((m) => ({ default: m.RoomsPage })));
const RoomEditorPage = lazy(() => import('@/pages/admin/RoomEditorPage.jsx').then((m) => ({ default: m.RoomEditorPage })));
const BookingsPage = lazy(() => import('@/pages/admin/BookingsPage.jsx').then((m) => ({ default: m.BookingsPage })));
const BookingDetailPage = lazy(() => import('@/pages/admin/BookingDetailPage.jsx').then((m) => ({ default: m.BookingDetailPage })));
const PaymentsPage = lazy(() => import('@/pages/admin/PaymentsPage.jsx').then((m) => ({ default: m.PaymentsPage })));
const RefundsPage = lazy(() => import('@/pages/admin/RefundsPage.jsx').then((m) => ({ default: m.RefundsPage })));
const CustomersPage = lazy(() => import('@/pages/admin/CustomersPage.jsx').then((m) => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() => import('@/pages/admin/CustomerDetailPage.jsx').then((m) => ({ default: m.CustomerDetailPage })));
const AuditLogsPage = lazy(() => import('@/pages/admin/AuditLogsPage.jsx').then((m) => ({ default: m.AuditLogsPage })));
const ReviewsPage = lazy(() => import('@/pages/admin/ReviewsPage.jsx').then((m) => ({ default: m.ReviewsPage })));
const ManagersPage = lazy(() => import('@/pages/admin/ManagersPage.jsx').then((m) => ({ default: m.ManagersPage })));
const ManagerDetailPage = lazy(() => import('@/pages/admin/ManagerDetailPage.jsx').then((m) => ({ default: m.ManagerDetailPage })));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage.jsx').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage.jsx').then((m) => ({ default: m.SettingsPage })));
const AdminProfilePage = lazy(() => import('@/pages/admin/ProfilePage.jsx').then((m) => ({ default: m.AdminProfilePage })));
const InvoicesPage = lazy(() => import('@/pages/admin/InvoicesPage.jsx').then((m) => ({ default: m.InvoicesPage })));
const AdminOffersPage = lazy(() => import('@/pages/admin/OffersPage.jsx').then((m) => ({ default: m.OffersPage })));
const OfferFormPage = lazy(() => import('@/pages/admin/OfferFormPage.jsx').then((m) => ({ default: m.OfferFormPage })));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage.jsx').then((m) => ({ default: m.UsersPage })));
const UserDetailPage = lazy(() => import('@/pages/admin/UserDetailPage.jsx').then((m) => ({ default: m.UserDetailPage })));
const PartnerApplicationsPage = lazy(() => import('@/pages/admin/PartnerApplicationsPage.jsx').then((m) => ({ default: m.PartnerApplicationsPage })));
const PartnerApplicationDetailPage = lazy(() => import('@/pages/admin/PartnerApplicationDetailPage.jsx').then((m) => ({ default: m.PartnerApplicationDetailPage })));

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
    <>
      <ScrollToTop />
      <PresenceTracker />
      <Routes>
        <Route element={<CustomerLayout />}>
        <Route index element={<HomePage />} />
        <Route path="hotels" element={<HotelsPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="partner/register" element={<PartnerRegisterPage />} />
        <Route path="partner/verify-otp" element={<PartnerOtpPage />} />
        <Route path="destinations" element={<DestinationsPage />} />
        <Route path="offers" element={<OffersPage />} />
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
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="partner/documents" element={<PartnerDocumentsPage />} />
          <Route path="partner/status" element={<ApplicationStatusPage />} />
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
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="offers" element={<AdminOffersPage />} />
        <Route path="offers/new" element={<OfferFormPage />} />
        <Route path="offers/:id" element={<OfferFormPage />} />
        {/* Notifications are a per-user store, so the customer page's own component/API works unchanged here too. */}
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="managers" element={<ManagersPage />} />
        <Route path="managers/:id" element={<ManagerDetailPage />} />
        <Route path="partners" element={<PartnerApplicationsPage />} />
        <Route path="partners/:userId" element={<PartnerApplicationDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="audit-logs" element={<AuditLogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<AdminProfilePage />} />
      </Route>
      </Routes>
    </>
  );
}

