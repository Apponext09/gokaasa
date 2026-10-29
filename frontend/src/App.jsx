import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { CustomerLayout } from '@/layouts/CustomerLayout.jsx';
import { AdminLayout } from '@/layouts/AdminLayout.jsx';
import { RequireAuth } from '@/components/shared/index.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PresenceTracker } from '@/features/presence/PresenceTracker.jsx';
import { ScrollToTop } from '@/components/shared/ScrollToTop.jsx';
import { lazy } from 'react';

const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));

// Customer routes are split too: opening one page should not download every booking, profile, partner,
// hotel-detail and map screen up front. CustomerLayout keeps the navigation visible while a chunk loads.
const HomePage = lazyNamed(() => import('@/pages/customer/HomePage.jsx'), 'HomePage');
const HotelsPage = lazyNamed(() => import('@/pages/customer/HotelsPage.jsx'), 'HotelsPage');
const DestinationsPage = lazyNamed(() => import('@/pages/customer/DestinationsPage.jsx'), 'DestinationsPage');
const OffersPage = lazyNamed(() => import('@/pages/customer/OffersPage.jsx'), 'OffersPage');
const WishlistPage = lazyNamed(() => import('@/pages/customer/WishlistPage.jsx'), 'WishlistPage');
const NearbyHotelsPage = lazyNamed(() => import('@/pages/customer/NearbyHotelsPage.jsx'), 'NearbyHotelsPage');
const AboutPage = lazyNamed(() => import('@/pages/customer/AboutPage.jsx'), 'AboutPage');
const ContactPage = lazyNamed(() => import('@/pages/customer/ContactPage.jsx'), 'ContactPage');
const ProfilePage = lazyNamed(() => import('@/pages/customer/ProfilePage.jsx'), 'ProfilePage');
const NotificationsPage = lazyNamed(() => import('@/pages/customer/NotificationsPage.jsx'), 'NotificationsPage');
const HotelDetailsPage = lazyNamed(() => import('@/pages/customer/HotelDetailsPage.jsx'), 'HotelDetailsPage');
const GuestDetailsPage = lazyNamed(() => import('@/pages/customer/booking/GuestDetailsPage.jsx'), 'GuestDetailsPage');
const BookingReviewPage = lazyNamed(() => import('@/pages/customer/booking/BookingReviewPage.jsx'), 'BookingReviewPage');
const BookingConfirmationPage = lazyNamed(() => import('@/pages/customer/booking/BookingConfirmationPage.jsx'), 'BookingConfirmationPage');
const MyTripsPage = lazyNamed(() => import('@/pages/customer/booking/MyTripsPage.jsx'), 'MyTripsPage');
const BookingDetailsPage = lazyNamed(() => import('@/pages/customer/booking/BookingDetailsPage.jsx'), 'BookingDetailsPage');
const LoginPage = lazyNamed(() => import('@/pages/auth/AuthPages.jsx'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('@/pages/auth/AuthPages.jsx'), 'RegisterPage');
const ForgotPasswordPage = lazyNamed(() => import('@/pages/auth/AuthPages.jsx'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(() => import('@/pages/auth/AuthPages.jsx'), 'ResetPasswordPage');
const PartnerRegisterPage = lazyNamed(() => import('@/pages/partner/PartnerRegisterPage.jsx'), 'PartnerRegisterPage');
const PartnerOtpPage = lazyNamed(() => import('@/pages/partner/PartnerOtpPage.jsx'), 'PartnerOtpPage');
const PartnerDocumentsPage = lazyNamed(() => import('@/pages/partner/PartnerDocumentsPage.jsx'), 'PartnerDocumentsPage');
const ApplicationStatusPage = lazyNamed(() => import('@/pages/partner/ApplicationStatusPage.jsx'), 'ApplicationStatusPage');

// Lazy: none of this admin code is in the customer homepage's initial bundle, and within admin each
// module loads only when its own route is visited (the dashboard never pulls in Reports/Reviews/etc).
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage.jsx').then((m) => ({ default: m.DashboardPage })));
const HotelListPage = lazy(() => import('@/pages/admin/HotelListPage.jsx').then((m) => ({ default: m.HotelListPage })));
const HotelOnboardingPage = lazy(() => import('@/pages/admin/HotelOnboardingPage.jsx').then((m) => ({ default: m.HotelOnboardingPage })));
const HotelReviewsPage = lazy(() => import('@/pages/admin/HotelReviewsPage.jsx').then((m) => ({ default: m.HotelReviewsPage })));
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
const MasterDataPage = lazy(() => import('@/pages/admin/MasterDataPage.jsx').then((m) => ({ default: m.MasterDataPage })));

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

/** Keeps old destination URLs working while making /hotels the single listing-page implementation. */
function LegacyHotelSearchRedirect() {
  const { destination } = useParams();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (destination) params.set('destination', destination);
  return <Navigate replace to={`/hotels?${params.toString()}`} />;
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
        <Route path="hotels/:destination" element={<LegacyHotelSearchRedirect />} />
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
        <Route path="hotel-reviews" element={<HotelReviewsPage />} />
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
        <Route path="masters" element={<MasterDataPage />} />
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

