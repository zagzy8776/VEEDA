import { useState, useEffect } from 'react';

const GPSManager = () => {
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [watchPosition, setWatchPosition] = useState<number | null>(null);

  useEffect(() => {
    if (watchPosition) {
      navigator.geolocation.clearWatch(watchPosition);
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation(position);
      },
      (error) => {
        console.error(error);
      },
      {
        enableHighAccuracy: true,
      }
    );
    setWatchPosition(watchId);

    return () => {
      if (watchPosition) {
        navigator.geolocation.clearWatch(watchPosition);
      }
    };
  }, []);

  return location;
};

export default GPSManager;