import React from 'react';

const Home = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Welcome to Home</h1>
      <p style={styles.content}>
        This is the home page of our React application. Here you can find information about our services and navigate to other sections of the website.
      </p>
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Featured Content</h3>
        <p style={styles.cardContent}>
          Discover amazing features and explore our platform to get the most out of your experience.
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: '1.5rem',
    fontSize: '2.5rem',
  },
  content: {
    fontSize: '1.1rem',
    lineHeight: '1.6',
    color: '#34495e',
    marginBottom: '2rem',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#f8f9fa',
    padding: '1.5rem',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    color: '#495057',
    marginBottom: '1rem',
    fontSize: '1.3rem',
  },
  cardContent: {
    color: '#6c757d',
    lineHeight: '1.5',
  },
};

export default Home;
