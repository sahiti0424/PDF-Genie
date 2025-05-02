const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { Storage } = require("@google-cloud/storage");
const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// CONFIGURATION
const bucketName = "pdf-demo-bucket-mani";
const processorId = "4682997b424b980d"; // Document AI Processor ID
const projectId = "valid-verbena-449610-q5";
const location = "us"; // or your processor region

// Add this check to verify processor exists
const checkProcessor = async () => {
  try {
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    const [processor] = await documentAIClient.getProcessor({ name });
    console.log('Processor verified:', processor.name);
  } catch (error) {
    console.error('Processor verification failed:', error.message);
    process.exit(1);
  }
};

// Initialize Storage with credentials
const storage = new Storage({
  keyFilename: "D:\\Downloads\\valid-verbena-449610-q5-80ba93d6166c.json",
  projectId: projectId
});

// Initialize Document AI client with explicit credentials
const documentAIClient = new DocumentProcessorServiceClient({
  credentials: {
    client_email: require("D:\\Downloads\\valid-verbena-449610-q5-80ba93d6166c.json").client_email,
    private_key: require("D:\\Downloads\\valid-verbena-449610-q5-80ba93d6166c.json").private_key
  },
  projectId: projectId
});

const uploadToCloudStorage = async (localPath, filename) => {
  await storage.bucket(bucketName).upload(localPath, {
    destination: filename,
  });
  return `gs://${bucketName}/${filename}`;
};

// Store processed PDFs in memory (in production, use Redis or a database)
const processedDocs = new Map();

// Route 1: Handle PDF upload and OCR
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const filename = req.file.originalname;

    // 1. Upload to Cloud Storage
    const gcsPath = await uploadToCloudStorage(filePath, filename);

    // 2. Call Document AI OCR
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    const request = {
      name,
      rawDocument: {
        content: await fs.promises.readFile(filePath),
        mimeType: "application/pdf",
      },
    };

    const [result] = await documentAIClient.processDocument(request);
    const fullText = result.document.text;

    // Generate a unique ID for this document
    const docId = Math.random().toString(36).substring(7);
    
    // Store the processed text
    processedDocs.set(docId, fullText);

    res.json({ docId });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: "Error processing document",
      details: error.message 
    });
  }
});

// Route 2: Handle questions using processed text
app.post("/ask/:docId", async (req, res) => {
  try {
    const { docId } = req.params;
    const { question } = req.body;

    // Get the processed text for this document
    const fullText = processedDocs.get(docId);
    if (!fullText) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Call Gemini with the stored text
    const geminiRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyBGi7wobJF7eIRDJoGNfddsuoOo-W9ew9E",
      {
        contents: [
          {
            parts: [
              {
                text: `Based on the following context, provide a detailed and comprehensive answer to the question. 
                Include relevant examples, explanations, and key points where applicable.
                If the information isn't directly stated in the context, mention that.
                
                Question: ${question}
                
                Context:
                ${fullText}
                
                Please structure your response with:
                - Main answer
                - Key details and examples
                - Additional context (if available)
                Use "*" around important terms or concepts for emphasis.`
              }
            ]
          }
        ]
      }
    );
    const answer = geminiRes.data.candidates[0].content.parts[0].text;
    res.json({ answer });

  } catch (error) {
    console.error('Ask error:', error);
    res.status(500).json({ 
      error: "Error answering question",
      details: error.message 
    });
  }
});

const PORT = 5000;

const testPermissions = async () => {
  try {
    // Test Storage permissions
    await storage.bucket(bucketName).exists();
    console.log('✓ Storage permissions verified');
    
    // Test Document AI permissions
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    await documentAIClient.getProcessor({ name });
    console.log('✓ Document AI permissions verified');
    
    return true;
  } catch (error) {
    console.error('Permission test failed:', error.message);
    return false;
  }
};

// Add this before starting the server
checkProcessor()
  .then(() => testPermissions())
  .then((permissionsOk) => {
    if (permissionsOk) {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    } else {
      console.error('Permission verification failed');
      process.exit(1);
    }
  });