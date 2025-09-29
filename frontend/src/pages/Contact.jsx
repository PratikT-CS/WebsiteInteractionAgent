import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [id.replace("agent-", "")]: value,
    }));
  };

  // Listen for agent-fill events to sync DOM changes with React state
  useEffect(() => {
    const handleAgentFill = (event) => {
      const { value, selector } = event.detail;

      console.log(`📨 Received agent-fill event:`, { value, selector });

      // Extract field name from selector
      // Handle different selector formats: "#agent-name", "agent-name", etc.
      let fieldName = selector;
      if (selector.startsWith("#")) {
        fieldName = selector.substring(1); // Remove #
      }
      if (fieldName.startsWith("agent-")) {
        fieldName = fieldName.replace("agent-", ""); // Remove agent- prefix
      }

      console.log(`🔄 Extracted field name: "${fieldName}"`);

      // Update the form data state
      setFormData((prev) => {
        const newData = {
          ...prev,
          [fieldName]: value,
        };
        console.log(`📝 Updated form data:`, newData);
        return newData;
      });
    };

    // Add event listener for agent-fill events
    document.addEventListener("agent-fill", handleAgentFill);
    console.log("🎧 Added agent-fill event listener");

    // Cleanup event listener on component unmount
    return () => {
      document.removeEventListener("agent-fill", handleAgentFill);
      console.log("🧹 Removed agent-fill event listener");
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Basic validation
    if (!formData.name || !formData.email || !formData.message) {
      toast.error("Please fill in all fields");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Simulate form submission
    toast.success("Message sent successfully!!!");

    // Reset form
    setFormData({
      name: "",
      email: "",
      message: "",
    });
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Contact Us</h1>
      <div style={styles.content}>
        <div style={styles.formContainer}>
          <h3 style={styles.formTitle}>Send us a Message</h3>
          <form style={styles.form} onSubmit={handleSubmit}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Name</label>
              <input
                id="agent-name"
                type="text"
                style={styles.input}
                placeholder="Your name"
                value={formData.name}
                onChange={handleInputChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <input
                id="agent-email"
                type="email"
                style={styles.input}
                placeholder="your.email@example.com"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Message</label>
              <textarea
                id="agent-message"
                style={styles.textarea}
                placeholder="Your message"
                rows="5"
                value={formData.message}
                onChange={handleInputChange}
              ></textarea>
            </div>
            <button id="agent-submit" type="submit" style={styles.submitButton}>
              Send Message
            </button>
          </form>
        </div>
        <div style={styles.contactInfo}>
          <h2 style={styles.sectionTitle}>Get in Touch</h2>
          <p style={styles.description}>
            We'd love to hear from you. Send us a message and we'll respond as
            soon as possible.
          </p>
          <div style={styles.contactDetails}>
            <div style={styles.contactItem}>
              <h4 style={styles.contactLabel}>Email</h4>
              <p style={styles.contactValue}>contact@example.com</p>
            </div>
            <div style={styles.contactItem}>
              <h4 style={styles.contactLabel}>Phone</h4>
              <p style={styles.contactValue}>+1 (555) 123-4567</p>
            </div>
            <div style={styles.contactItem}>
              <h4 style={styles.contactLabel}>Address</h4>
              <p style={styles.contactValue}>
                123 Business St, City, State 12345
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: "2rem",
    maxWidth: "1000px",
    margin: "0 auto",
    fontFamily: "Arial, sans-serif",
  },
  title: {
    color: "#2c3e50",
    textAlign: "center",
    marginBottom: "2rem",
    fontSize: "2.5rem",
  },
  content: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "3rem",
    alignItems: "start",
  },
  contactInfo: {
    backgroundColor: "#f8f9fa",
    padding: "2rem",
    borderRadius: "10px",
  },
  sectionTitle: {
    color: "#2c3e50",
    marginBottom: "1rem",
    fontSize: "1.5rem",
  },
  description: {
    color: "#7f8c8d",
    lineHeight: "1.6",
    marginBottom: "2rem",
  },
  contactDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  contactItem: {
    padding: "1rem",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    border: "1px solid #e9ecef",
  },
  contactLabel: {
    color: "#3498db",
    marginBottom: "0.5rem",
    fontSize: "1rem",
  },
  contactValue: {
    color: "#2c3e50",
    margin: 0,
  },
  formContainer: {
    backgroundColor: "#ffffff",
    padding: "2rem",
    borderRadius: "10px",
    border: "1px solid #e9ecef",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  formTitle: {
    color: "#2c3e50",
    marginBottom: "1.5rem",
    fontSize: "1.3rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
  },
  label: {
    color: "#2c3e50",
    marginBottom: "0.5rem",
    fontSize: "0.9rem",
    fontWeight: "bold",
  },
  input: {
    padding: "0.75rem",
    border: "1px solid #ddd",
    borderRadius: "5px",
    fontSize: "1rem",
  },
  textarea: {
    padding: "0.75rem",
    border: "1px solid #ddd",
    borderRadius: "5px",
    fontSize: "1rem",
    resize: "vertical",
  },
  submitButton: {
    backgroundColor: "#3498db",
    color: "white",
    padding: "0.75rem 1.5rem",
    border: "none",
    borderRadius: "5px",
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "1rem",
  },
};

export default Contact;
