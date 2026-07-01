import { useState, useEffect } from 'react';

const MapManager = () => {
  const [map, setMap] = useState<any>(null);
  const [userHasPanned, setUserHasPanned] = useState(false);

  useEffect(() => {
    const handleDragStart = () => {
      setUserHasPanned(true);
    };

    const handlePinchZoom = () => {
      setUserHasPanned(true);
    };

    if (map) {
      map.on('dragstart', handleDragStart);
      map.on('pinchzoom', handlePinchZoom);
    }

    return () => {
      if (map) {
        map.off('dragstart', handleDragStart);
        map.off('pinchzoom', handlePinchZoom);
      }
    };
  }, [map]);

  return { map, setMap, userHasPanned, setUserHasPanned };
};

export default MapManager;