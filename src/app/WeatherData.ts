import { useState, useEffect } from 'react';

const WeatherData = () => {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch('https://api.openweathermap.org/data/2.5/weather?q=London,uk&appid=YOUR_API_KEY');
        const data = await response.json();
        setWeather(data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchWeather();
  }, []);

  return weather;
};

export default WeatherData;