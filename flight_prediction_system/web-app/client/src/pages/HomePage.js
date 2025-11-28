import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/header';
import MainSection from '../components/sections/main_section';
import FeaturesSection from '../components/sections/FeaturesSection';
import CTASection from '../components/sections/CTASection';
import '../App.css';

const HomePage = () => {
  const navigate = useNavigate();

  // Handle search form submission
  const handleSearch = (formData) => {
    console.log('🔍 Form data received:', formData);
    
    // Transform form data to match API expectations
    const searchParams = {
      from: formData.from,
      to: formData.to,
      departDate: formData.departDate,
      returnDate: formData.returnDate || null,
      tripType: formData.tripType,
      adults: formData.passengers?.adult || 1,
      children: formData.passengers?.child || 0,
      infants: formData.passengers?.infant || 0
    };
    
    console.log('🔍 Transformed search params:', searchParams);
    
    // Navigate to search results page with search params
    navigate('/search-results', {
      state: { searchParams }
    });
  };

  return (
    <div className="App">
      <div className="app-video-background">
        <video 
          className="app-background-video"
          autoPlay 
          loop 
          muted 
          playsInline
        >
          <source src="/video/background.mp4" type="video/mp4" />
        </video>
        <div className="app-video-overlay"></div>
      </div>
      
      <Header />
      
      <MainSection onSearch={handleSearch} />
      
      <FeaturesSection />
      
      <CTASection />
    </div>
  );
};

export default HomePage;

