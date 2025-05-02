import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import './App.css';
import UploadPage from './components/UploadPage';
import ChatPage from './components/ChatPage';

function formatBotMessage(text) {
  // Handle bullet points
  let formatted = text.replace(/^[-*]\s+/gm, '• ');
  
  // Handle bold text with asterisks
  formatted = formatted.replace(/\*\*?(.*?)\*\*?/g, '<strong>$1</strong>');
  
  // Handle headings
  formatted = formatted.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
  formatted = formatted.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
  formatted = formatted.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
  
  // Handle lists and paragraphs
  formatted = formatted.split('\n').map(line => {
    if (line.trim().startsWith('•')) {
      return `<li>${line.trim()}</li>`;
    }
    return line.trim() ? `<p>${line}</p>` : '';
  }).join('');
  
  // Wrap lists in ul tags
  formatted = formatted.replace(/<li>.*?<\/li>/gs, match => `<ul>${match}</ul>`);
  
  return formatted;
}

function App() {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [docId, setDocId] = useState(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const handleFileUpload = async (selectedFile) => {
    setLoading(true);
    const formData = new FormData();
    formData.append("pdf", selectedFile);

    try {
      const uploadRes = await axios.post("http://localhost:5000/upload", formData);
      setFile(selectedFile);
      setDocId(uploadRes.data.docId);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || !docId) return;

    setLoading(true);
    try {
      const res = await axios.post(`http://localhost:5000/ask/${docId}`, {
        question: question
      });
      
      setMessages(prev => [
        ...prev,
        { type: 'user', content: question },
        { type: 'bot', content: formatBotMessage(res.data.answer) }
      ]);
      setQuestion("");
      setTimeout(() => {
        chatContainerRef.current?.scrollTo(0, chatContainerRef.current.scrollHeight);
      }, 100);
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { type: 'user', content: question },
        { type: 'bot', content: "Sorry, I couldn't process your request." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {!file ? (
        <UploadPage onFileSelect={handleFileUpload} />
      ) : (
        <ChatPage
          file={file}
          fileUrl={fileUrl}
          messages={messages}
          loading={loading}
          question={question}
          chatContainerRef={chatContainerRef}
          onNewChat={() => {
            setFile(null);
            setDocId(null);
            setMessages([]);
          }}
          onQuestionChange={(e) => setQuestion(e.target.value)}
          onSubmit={handleSubmit}
          formatBotMessage={formatBotMessage}
        />
      )}
    </div>
  );
}

export default App;
