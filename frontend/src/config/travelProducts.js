import { Bus, Building2, Car, Clock3, Hotel, Palmtree, Plane, TrainFront } from 'lucide-react';

/**
 * Primary travel-product navigation shown in the header, mobile drawer, and homepage hero tabs.
 * Hotels is the only product with a real, working booking flow; every other entry opens
 * ComingSoonModal instead of navigating anywhere.
 */
export const TRAVEL_PRODUCTS = [
  {
    key: 'hotels',
    label: 'Hotels',
    icon: Hotel,
    status: 'active',
    to: '/',
  },
  {
    key: 'homestays-villas',
    label: 'Homestays & Villas',
    icon: Building2,
    status: 'coming-soon',
    description: 'Private homestays and villas for a more personal kind of stay.',
  },
  {
    key: 'hourly-stays',
    label: 'Hourly & Day Stays',
    icon: Clock3,
    status: 'coming-soon',
    description: 'Flexible short stays for work, rest, and quick city stopovers.',
  },
  {
    key: 'flights',
    label: 'Flights',
    icon: Plane,
    status: 'coming-soon',
    description: "Compare and book flights for your next trip, right alongside your hotel stay.",
  },
  {
    key: 'trains',
    label: 'Trains',
    icon: TrainFront,
    status: 'coming-soon',
    description: 'Search and book train tickets across India with ease.',
  },
  {
    key: 'buses',
    label: 'Buses',
    icon: Bus,
    status: 'coming-soon',
    description: 'Find and book bus tickets for comfortable, affordable journeys.',
  },
  {
    key: 'cabs',
    label: 'Cabs',
    icon: Car,
    status: 'coming-soon',
    description: 'Book reliable cabs for airport transfers and getting around on your trip.',
  },
  {
    key: 'holiday-packages',
    label: 'Holiday Packages',
    icon: Palmtree,
    status: 'coming-soon',
    description: 'Curated holiday packages that take care of your whole trip, start to finish.',
  },
];
