import { useState, useEffect, useRef } from 'react';

interface Place {
  id: number;
  name: string;
  type: string;
  category: string;
  dist: string;
  distM: number;
  lat: number;
  lng: number;
  phone?: string | null;
  opening_hours?: string | null;
  website?: string | null;
}

interface MapManagerState {
  places: Place[];
  loading: boolean;
  error: string | null;
  userHasPanned: boolean;
}

const EnhancedMapManager = () => {
  const [state, setState] = useState<MapManagerState>({
    places: [],
    loading: false,
    error: null,
    userHasPanned: false
  });
  
  const mapRef = useRef<any>(null);
  const userHasPannedRef = useRef(false);

  // Fix for Problem 1: Track both drag and pinch zoom
  const setupMapInteractions = (map: any) => {
    if (!map) return;

    const handleDragStart = () => {
      userHasPannedRef.current = true;
      setState(prev => ({ ...prev, userHasPanned: true }));
    };

    const handleZoomStart = () => {
      userHasPannedRef.current = true;
      setState(prev => ({ ...prev, userHasPanned: true }));
    };

    map.on('dragstart', handleDragStart);
    map.on('zoomstart', handleZoomStart);

    return () => {
      map.off('dragstart', handleDragStart);
      map.off('zoomstart', handleZoomStart);
    };
  };

  // Enhanced nearby places fetching with fallback
  const fetchNearbyPlaces = async (lat: number, lng: number): Promise<Place[]> => {
    try {
      // Try backend API first
      const response = await fetch(`/api/map/nearby?lat=${lat}&lng=${lng}`);
      if (response.ok) {
        const data = await response.json();
        return data.places || [];
      }
    } catch (error) {
      console.error('Backend API failed:', error);
    }

    // Fallback: Direct Overpass API call
    try {
      const radius = 0.08; // ~8km radius
      const bbox = `${lat - radius},${lng - radius},${lat + radius},${lng + radius}`;
      
      const query = `[out:json][timeout:25];(
        node[amenity~"hospital|pharmacy|clinic|doctors|dentist|veterinary"](${bbox});
        node[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"](${bbox});
        node[shop~"supermarket|convenience|grocery|mall|department_store|bakery|butcher|greengrocer"](${bbox});
        node[amenity~"school|university|college|bank|atm|fuel|parking|police|fire_station"](${bbox});
        node[tourism~"hotel|hostel|motel|guest_house"](${bbox});
        node[amenity="place_of_worship"](${bbox});
      );out center 100;`;

      const response = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      );
      
      const data = await response.json();
      
      return (data.elements || [])
        .filter((e: any) => (e.lat || e.center) && e.tags?.name)
        .map((e: any, i: number) => {
          const plat = e.lat ?? e.center.lat;
          const plng = e.lon ?? e.center.lon;
          
          // Calculate distance
          const R = 6371000;
          const toR = (x: number) => x * Math.PI / 180;
          const dLat = toR(plat - lat);
          const dLng = toR(plng - lng);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat)) * Math.cos(toR(plat)) * Math.sin(dLng / 2) ** 2;
          const distM = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
          
          const amenity = e.tags?.amenity || e.tags?.shop || e.tags?.tourism || 'place';
          
          return {
            id: i,
            name: e.tags.name,
            type: amenity,
            category: getCategory(amenity),
            phone: e.tags?.phone || e.tags?.['contact:phone'] || null,
            opening_hours: e.tags?.opening_hours || null,
            website: e.tags?.website || e.tags?.['contact:website'] || null,
            distM,
            dist: distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}km`,
            lat: plat,
            lng: plng,
          };
        })
        .sort((a: Place, b: Place) => a.distM - b.distM);
    } catch (error) {
      console.error('Overpass API failed:', error);
      return [];
    }
  };

  const getCategory = (amenity: string): string => {
    if (['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'veterinary'].includes(amenity)) return 'health';
    if (['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court'].includes(amenity)) return 'food';
    if (['supermarket', 'convenience', 'grocery', 'mall', 'department_store', 'bakery', 'butcher', 'greengrocer'].includes(amenity)) return 'shopping';
    if (['school', 'university', 'college'].includes(amenity)) return 'education';
    if (['bank', 'atm'].includes(amenity)) return 'finance';
    if (['hotel', 'hostel', 'motel', 'guest_house'].includes(amenity)) return 'lodging';
    if (['fuel', 'parking'].includes(amenity)) return 'transport';
    if (['police', 'fire_station'].includes(amenity)) return 'emergency';
    return 'other';
  };

  // Update map when location changes
  const updateMapLocation = (lat: number, lng: number, accuracy: number | null) => {
    if (!mapRef.current) return;
    
    const L = (window as any).L;
    if (!L) return;

    // Update user marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:20px;height:20px;background:#2DD4A4;border:3px solid #07101D;border-radius:50%;box-shadow:0 0 0 6px rgba(45,212,164,0.2),0 0 16px rgba(45,212,164,0.5)"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    // Only auto-center if user hasn't panned
    if (!userHasPannedRef.current) {
      mapRef.current.setView([lat, lng], 15, { animate: true });
    }
  };

  return {
    state,
    setState,
    mapRef,
    userHasPannedRef,
    setupMapInteractions,
    fetchNearbyPlaces,
    updateMapLocation,
  };
};

export default EnhancedMapManager;