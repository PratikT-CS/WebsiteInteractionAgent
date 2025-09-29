import React from 'react';

const About = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>About Us</h1>
      <div style={styles.content}>
        <p style={styles.paragraph}>
          We are a passionate team dedicated to creating innovative solutions and delivering exceptional experiences to our users.
        </p>
        <p style={styles.paragraph}>
          Our mission is to provide high-quality services and products that make a positive impact in the digital world.
        </p>
      </div>
      <div style={styles.features}>
        <div style={styles.feature}>
          <h3 style={styles.featureTitle}>Innovation</h3>
          <p style={styles.featureText}>We constantly push boundaries and explore new technologies.</p>
        </div>
        <div style={styles.feature}>
          <h3 style={styles.featureTitle}>Quality</h3>
          <p style={styles.featureText}>We maintain the highest standards in everything we do.</p>
        </div>
        <div style={styles.feature}>
          <h3 style={styles.featureTitle}>Community</h3>
          <p style={styles.featureText}>We believe in building strong relationships with our users.</p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '900px',
    margin: '0 auto',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: '2rem',
    fontSize: '2.5rem',
  },
  content: {
    marginBottom: '3rem',
  },
  paragraph: {
    fontSize: '1.1rem',
    lineHeight: '1.7',
    color: '#34495e',
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  features: {
    display: 'flex',
    gap: '2rem',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  feature: {
    backgroundColor: '#ffffff',
    padding: '1.5rem',
    borderRadius: '10px',
    border: '2px solid #e9ecef',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    flex: '1',
    minWidth: '250px',
    textAlign: 'center',
  },
  featureTitle: {
    color: '#3498db',
    marginBottom: '1rem',
    fontSize: '1.4rem',
  },
  featureText: {
    color: '#7f8c8d',
    lineHeight: '1.5',
  },
};

export default About;
