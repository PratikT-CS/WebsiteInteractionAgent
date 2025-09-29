import React from 'react';

const Services = () => {
  const services = [
    {
      title: 'Web Development',
      description: 'Custom web applications built with modern technologies and best practices.',
      icon: '🌐'
    },
    {
      title: 'Mobile Apps',
      description: 'Native and cross-platform mobile applications for iOS and Android.',
      icon: '📱'
    },
    {
      title: 'UI/UX Design',
      description: 'Beautiful and intuitive user interfaces that enhance user experience.',
      icon: '🎨'
    },
    {
      title: 'Consulting',
      description: 'Expert advice and guidance for your digital transformation journey.',
      icon: '💡'
    }
  ];

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Our Services</h1>
      <p style={styles.subtitle}>
        We offer a comprehensive range of digital services to help your business grow and succeed.
      </p>
      <div style={styles.servicesGrid}>
        {services.map((service, index) => (
          <div key={index} style={styles.serviceCard}>
            <div style={styles.icon}>{service.icon}</div>
            <h3 style={styles.serviceTitle}>{service.title}</h3>
            <p style={styles.serviceDescription}>{service.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1000px',
    margin: '0 auto',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: '1rem',
    fontSize: '2.5rem',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: '1.1rem',
    color: '#7f8c8d',
    marginBottom: '3rem',
    maxWidth: '600px',
    margin: '0 auto 3rem auto',
  },
  servicesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '2rem',
  },
  serviceCard: {
    backgroundColor: '#ffffff',
    padding: '2rem',
    borderRadius: '12px',
    border: '1px solid #e9ecef',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    textAlign: 'center',
    transition: 'transform 0.3s ease',
  },
  icon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  serviceTitle: {
    color: '#2c3e50',
    marginBottom: '1rem',
    fontSize: '1.3rem',
  },
  serviceDescription: {
    color: '#7f8c8d',
    lineHeight: '1.6',
    fontSize: '0.95rem',
  },
};

export default Services;
