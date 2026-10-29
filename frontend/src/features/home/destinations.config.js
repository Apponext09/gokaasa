/**
 * The only place Mumbai/Navi Mumbai city and area names are hardcoded. Adding a new city later means
 * adding an object here -- no component or CSS file needs to change. Each area is validated against
 * real backend data (discoveryApi.suggestDestinations) before it's ever shown; see DestinationCard's
 * caller in HomePage.jsx. Nothing here is a guess at hotel counts or inventory -- it's just the list of
 * places worth asking the backend about.
 */
export const CITIES = [
  {
    id: 'mumbai',
    name: 'Mumbai',
    citySlug: 'mumbai',
    tagline: 'Vibrant city escapes',
    areas: [
      { id: 'south-mumbai', label: 'South Mumbai' },
      { id: 'bandra', label: 'Bandra' },
      { id: 'andheri', label: 'Andheri' },
      { id: 'powai', label: 'Powai' },
      { id: 'juhu', label: 'Juhu' },
      { id: 'bkc', label: 'BKC' },
    ],
  },
  {
    id: 'navi-mumbai',
    name: 'Navi Mumbai',
    citySlug: 'navi-mumbai',
    tagline: 'Relaxing waterfront stays',
    areas: [
      { id: 'vashi', label: 'Vashi' },
      { id: 'nerul', label: 'Nerul' },
      { id: 'belapur', label: 'Belapur' },
      { id: 'seawoods', label: 'Seawoods' },
      { id: 'kharghar', label: 'Kharghar' },
      { id: 'airoli', label: 'Airoli' },
      { id: 'sanpada', label: 'Sanpada' },
    ],
  },
];

export const ALL_AREAS = CITIES.flatMap((city) => city.areas.map((area) => ({ ...area, citySlug: city.citySlug })));
