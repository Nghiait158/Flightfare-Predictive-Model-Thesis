import React from 'react';
import Header from './components/layout/header';
import MainSection from './components/sections/main_section';
import FeaturesSection from './components/sections/FeaturesSection';
import CTASection from './components/sections/CTASection';
import './App.css';

function App() {

  // Handle search form submission
  const handleSearch = (searchParams) => {
    console.log('🔍 Search params:', searchParams);
    // TODO: Implement search logic
    alert('Tìm kiếm chuyến bay: ' + JSON.stringify(searchParams));
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
}

export default App;
