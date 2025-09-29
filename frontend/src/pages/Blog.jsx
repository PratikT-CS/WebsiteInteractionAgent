import React from 'react';

const Blog = () => {
  const blogPosts = [
    {
      title: 'Getting Started with React',
      excerpt: 'Learn the fundamentals of React and how to build your first component.',
      date: 'September 20, 2024',
      readTime: '5 min read',
      category: 'Tutorial'
    },
    {
      title: 'Modern CSS Techniques',
      excerpt: 'Explore the latest CSS features and best practices for modern web development.',
      date: 'September 18, 2024',
      readTime: '7 min read',
      category: 'Design'
    },
    {
      title: 'JavaScript ES2024 Features',
      excerpt: 'Discover the new features and improvements in the latest JavaScript specification.',
      date: 'September 15, 2024',
      readTime: '6 min read',
      category: 'Development'
    },
    {
      title: 'Building Responsive Web Apps',
      excerpt: 'Tips and tricks for creating web applications that work perfectly on all devices.',
      date: 'September 12, 2024',
      readTime: '8 min read',
      category: 'Design'
    }
  ];

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Our Blog</h1>
      <p style={styles.subtitle}>
        Stay updated with the latest trends, tutorials, and insights from our team.
      </p>
      <div style={styles.blogGrid}>
        {blogPosts.map((post, index) => (
          <article key={index} style={styles.blogPost}>
            <div style={styles.postHeader}>
              <span style={styles.category}>{post.category}</span>
              <div style={styles.postMeta}>
                <span style={styles.date}>{post.date}</span>
                <span style={styles.readTime}>{post.readTime}</span>
              </div>
            </div>
            <h2 style={styles.postTitle}>{post.title}</h2>
            <p style={styles.postExcerpt}>{post.excerpt}</p>
            <button style={styles.readMoreButton}>Read More</button>
          </article>
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
  blogGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '2rem',
  },
  blogPost: {
    backgroundColor: '#ffffff',
    padding: '1.5rem',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  },
  postHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  category: {
    backgroundColor: '#3498db',
    color: 'white',
    padding: '0.25rem 0.75rem',
    borderRadius: '15px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
  },
  postMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    fontSize: '0.8rem',
    color: '#7f8c8d',
  },
  date: {
    marginBottom: '0.25rem',
  },
  readTime: {
    fontStyle: 'italic',
  },
  postTitle: {
    color: '#2c3e50',
    marginBottom: '1rem',
    fontSize: '1.3rem',
    lineHeight: '1.3',
  },
  postExcerpt: {
    color: '#7f8c8d',
    lineHeight: '1.6',
    marginBottom: '1.5rem',
  },
  readMoreButton: {
    backgroundColor: 'transparent',
    color: '#3498db',
    border: '2px solid #3498db',
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
};

export default Blog;
