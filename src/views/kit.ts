import AdminCalendar from "./pages/admin/calendar";
import AdminCatalog from "./pages/admin/catalog";
import AdminCustomer from "./pages/admin/customer";
import AdminCustomers from "./pages/admin/customers";
import AdminFrame from "./pages/admin/frame";
import AdminExtension from "./pages/admin/extension";
import AdminHours from "./pages/admin/hours";
import AdminInbox from "./pages/admin/inbox";
import AdminLogin from "./pages/admin/login";
import AdminSettings from "./pages/admin/settings";
import AdminStats from "./pages/admin/stats";
import AdminToday from "./pages/admin/today";
import SiteAccessibility from "./pages/site/accessibility";
import SiteBook from "./pages/site/book";
import SiteContact from "./pages/site/contact";
import SiteFrame from "./pages/site/frame";
import SiteGallery from "./pages/site/gallery";
import SiteHome from "./pages/site/home";
import SiteHours from "./pages/site/hours";
import SiteLanding from "./pages/site/landing";
import SiteManage from "./pages/site/manage";
import SiteNotFound from "./pages/site/not-found";
import SiteOffline from "./pages/site/offline";
import SitePrivacy from "./pages/site/privacy";
import SiteProducts from "./pages/site/products";
import SiteServices from "./pages/site/services";

// The kit's own views, by name: every page of the site and of the owner
// area, and the frame around each. A route in src/app renders one of these
// by name, so a client can put its own in its place (theme/views.ts).

export const KIT_VIEWS = {
  "site.home": SiteHome,
  "site.services": SiteServices,
  "site.products": SiteProducts,
  "site.gallery": SiteGallery,
  "site.hours": SiteHours,
  "site.contact": SiteContact,
  "site.book": SiteBook,
  "site.manage": SiteManage,
  "site.landing": SiteLanding,
  "site.privacy": SitePrivacy,
  "site.accessibility": SiteAccessibility,
  "site.notFound": SiteNotFound,
  "site.frame": SiteFrame,
  "site.offline": SiteOffline,
  "admin.today": AdminToday,
  "admin.calendar": AdminCalendar,
  "admin.customers": AdminCustomers,
  "admin.customer": AdminCustomer,
  "admin.catalog": AdminCatalog,
  "admin.hours": AdminHours,
  "admin.inbox": AdminInbox,
  "admin.settings": AdminSettings,
  "admin.stats": AdminStats,
  "admin.extension": AdminExtension,
  "admin.frame": AdminFrame,
  "admin.login": AdminLogin,
};
