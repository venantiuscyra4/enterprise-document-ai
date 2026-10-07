# Enterprise Document AI

## Browser-Native, Privacy-First RAG for PDF Documents

Enterprise Document AI is a browser-native Retrieval-Augmented Generation (RAG) application that allows users to upload PDF documents, ask questions about their contents, and receive grounded answers with page-level citations.

The system is designed to perform document processing, embeddings, retrieval, and language-model inference locally in the user's browser.

It does not require a traditional document-processing backend or a paid LLM API for its core workflow.

---

## 🌐 Project

**GitHub Repository:**  
https://github.com/venantiuscyra4/enterprise-document-ai

**Author:**  
Venantius Cyra S

---

## 🚀 What This Project Does

The application allows a user to:

1. Upload one or more PDF documents.
2. Extract text directly in the browser.
3. Split the document into meaningful chunks.
4. Generate embeddings locally.
5. Store document information locally.
6. Search the document using semantic similarity.
7. Combine semantic and lexical retrieval.
8. Validate whether sufficient document evidence exists.
9. Generate an answer using a local language model.
10. Display page-level source references.

### Overall Workflow

```text
PDF
 ↓
PDF.js
 ↓
Text Extraction
 ↓
Sentence-Aware Chunking
 ↓
Transformers.js
 ↓
Embeddings
 ↓
Local Storage
 ↓
Hybrid Retrieval
 ↓
Evidence Gate
 ↓
WebLLM
 ↓
WebGPU
 ↓
Grounded Answer
 ↓
Page Citation


✨ Features
- 📄 PDF document upload
- 📚 Multiple document support
- 🔒 Privacy-first architecture
- 🧠 Retrieval-Augmented Generation
- 🔎 Semantic search
- 📝 Lexical search
- 🔀 Hybrid retrieval
- 🛡️ Evidence-gated generation
- 🤖 Local LLM inference
- ⚡ WebGPU acceleration
- 📑 Page-level citations
- 💾 Browser-local storage
- 🗑️ Document management
- 🌐 Static deployment architecture
- 💰 No paid LLM API required
- 🔑 No external LLM API key required for the core Q&A pipeline
🏗️ Architecture
The application is designed around a browser-native RAG architecture.
                         USER
                          │
                          ▼
                  ┌───────────────┐
                  │   PDF Upload  │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │     PDF.js    │
                  │ Text Extract  │
                  └───────┬───────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Sentence-Aware  │
                 │    Chunking     │
                 └────────┬────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │   Transformers.js   │
               │  all-MiniLM-L6-v2   │
               └──────────┬──────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │   Embeddings  │
                  │  384 vectors  │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ IndexedDB /   │
                  │ Local Store   │
                  └───────┬───────┘
                          │
                          │
             ┌────────────┴────────────┐
             │                         │
             ▼                         ▼
      Semantic Search            Lexical Search
             │                         │
             └────────────┬────────────┘
                          │
                          ▼
                   Hybrid Ranking
                          │
                          ▼
                   Evidence Gate
                          │
                 ┌────────┴────────┐
                 │                 │
              Evidence          No Evidence
                Found               │
                 │                  ▼
                 ▼              Grounded
              WebLLM             Refusal
                 │
                 ▼
          SmolLM2-360M
                 │
                 ▼
         Grounded Response
                 │
                 ▼
          Page Citations

🔄 RAG Pipeline
1. PDF Upload
The user selects a PDF document.
The document is processed directly in the browser.
User PDF
   ↓
Browser

No document-processing server is required.
2. PDF Text Extraction
The application uses PDF.js to extract text from the PDF.
Each page is processed separately.
PDF
 │
 ├── Page 1 → Text
 ├── Page 2 → Text
 ├── Page 3 → Text
 └── Page 4 → Text

The page number is preserved because it is later used for citations.
3. Sentence-Aware Chunking
Large documents are divided into smaller chunks.
The current approach uses approximately:
Target chunk size: ~800 characters
Overlap:           ~120 characters

The system attempts to preserve sentence boundaries when creating chunks.
Example:
Document
   │
   ├── Sentence 1
   ├── Sentence 2
   ├── Sentence 3
   │
   └── Chunk 1

   ├── Sentence 3
   ├── Sentence 4
   ├── Sentence 5
   │
   └── Chunk 2

Why chunking?
Embedding an entire document as one vector would make retrieval too coarse.
Smaller chunks allow the system to retrieve the specific parts of the document that are relevant to a question.
Why overlap?
Overlap helps preserve context when information occurs near a chunk boundary.
🧠 Embeddings
The project uses:
Xenova/all-MiniLM-L6-v2

through:
@huggingface/transformers

The embedding model produces:
384-dimensional vectors

Conceptually:
Text
 ↓
Embedding Model
 ↓
[0.12, -0.08, 0.31, ...]

The same model is used for both document chunks and user questions.
This makes it possible to compare their semantic similarity.
🔢 Why all-MiniLM-L6-v2?
A browser-native application needs an embedding model that is relatively lightweight.
The model was selected because it provides a practical balance between:
- semantic representation
- model size
- inference speed
- browser compatibility
- memory requirements
The embedding pipeline uses:
device: wasm
dtype: q8

This allows embedding inference to run using WebAssembly.
🔍 Semantic Retrieval
When the user asks a question, the question is converted into an embedding.
The system compares the query embedding with document chunk embeddings.
User Question
      │
      ▼
Query Embedding
      │
      ▼
Document Embeddings
      │
      ▼
Cosine Similarity
      │
      ▼
Ranked Results

Cosine similarity is used to measure the similarity between vectors.
📝 Lexical Retrieval
Semantic similarity is not always enough.
A semantically related chunk may not actually contain the requested information.
Therefore, the system also checks lexical overlap between the user's question and document chunks.
For example:
Question:

"What is the course title?"

Document:

"The course is called Business Communication and Ethics."

The matching terminology provides additional retrieval evidence.
🔀 Hybrid Retrieval
The system combines semantic and lexical signals.
The current conceptual weighting is:
70% Semantic Similarity
30% Lexical Matching

Conceptually:
Hybrid Score =
    0.70 × Semantic Similarity
  + 0.30 × Lexical Score

This allows the retrieval system to benefit from both:
- meaning-based matching
- exact terminology matching
🛡️ Evidence-Gated Generation
One of the most important components of the project is the evidence gate.
A language model has pretrained knowledge that may not exist in the uploaded document.
For example, if the uploaded document is about Business Communication and Ethics and the user asks:
What is karma?

a language model may know the general meaning of karma.
However, that information would not necessarily come from the uploaded document.
The application therefore validates document evidence before allowing generation.
Question
   │
   ▼
Retrieve Evidence
   │
   ▼
Evidence Available?
   │
 ┌─┴─────────────┐
 │               │
YES             NO
 │               │
 ▼               ▼
LLM           Refusal
 │
 ▼
Grounded Answer

If the document does not contain meaningful evidence, the application should respond with a grounded refusal such as:
The information is not available in the provided document.

This helps reduce unsupported answers based purely on pretrained model knowledge.
🤖 WebLLM
The project uses:
@mlc-ai/web-llm

for browser-based local language-model inference.
The selected model is:
SmolLM2-360M-Instruct-q4f32_1-MLC

WebLLM allows the language model to execute locally in the browser.
⚡ WebGPU
WebGPU provides GPU acceleration for local LLM inference.
The architecture is:
Browser
   ↓
WebLLM
   ↓
WebGPU
   ↓
User GPU
   ↓
Local LLM Inference

Why WebGPU?
LLM inference entirely on CPU can be too slow for an interactive application.
WebGPU provides access to GPU acceleration directly from supported browsers.
This makes browser-native local inference more practical.
🧠 Why SmolLM2-360M?
A browser-native application needs to consider:
- GPU memory
- download size
- model initialization time
- inference speed
- hardware compatibility
The 360M parameter model is substantially smaller than many modern cloud-hosted LLMs.
This makes it more suitable for local browser inference.
The trade-off is that a small local model has less reasoning capability than larger models.
For this reason, the application relies heavily on:
Retrieval
+
Evidence Validation
+
Grounded Prompting

rather than expecting the LLM to independently know the answer.
💾 IndexedDB
The application uses browser-local storage for document-related information.
Conceptually:
PDF
 ↓
Extracted Text
 ↓
Chunks
 ↓
Embeddings
 ↓
IndexedDB

Why IndexedDB?
IndexedDB provides:
- browser-local persistence
- structured storage
- no remote database
- no database credentials
- improved privacy
- persistence across browser sessions
📚 Multiple Documents
The application supports working with multiple PDF documents.
Each document can conceptually contain:
Document
 ├── ID
 ├── Name
 ├── Pages
 ├── Chunks
 └── Embeddings

This allows the system to evolve into a multi-document knowledge base.
📑 Page-Level Citations
Each chunk retains its original page number.
For example:
Chunk:
"Effective communication requires..."

Page:
3

When this chunk is retrieved, the answer can reference:
Page 3

This makes answers more traceable and allows users to verify information against the original PDF.
🔐 Privacy Architecture
Privacy is a major design goal.
The intended data flow is:
                    USER DEVICE
┌──────────────────────────────────────────┐
│                                          │
│ PDF                                      │
│  ↓                                       │
│ PDF.js                                   │
│  ↓                                       │
│ Text Extraction                          │
│  ↓                                       │
│ Chunking                                 │
│  ↓                                       │
│ Local Embeddings                         │
│  ↓                                       │
│ Local Retrieval                          │
│  ↓                                       │
│ WebLLM + WebGPU                          │
│  ↓                                       │
│ Answer                                   │
│                                          │
└──────────────────────────────────────────┘

The core document-Q&A pipeline does not require sending the PDF to an external AI service.
🚫 No Paid LLM API
The core pipeline does not require an external LLM API such as:
OpenAI
Anthropic
Google Gemini
Cohere

This removes the need for:
- paid inference requests
- API key management
- server-side LLM infrastructure
- transmitting document content to a remote LLM
🗄️ Why No Remote Vector Database?
Traditional RAG systems commonly use vector databases such as:
Pinecone
Qdrant
Weaviate
Milvus
Chroma

This project deliberately avoids requiring a remote vector database.
Instead:
Browser
  ↓
Local Embeddings
  ↓
Local Storage
  ↓
Local Retrieval

This reduces infrastructure requirements and supports static hosting.
🛠️ Technology Stack
Technology	Purpose	Why It Was Used
Next.js	Application framework	React framework with static export support
React	User interface	Interactive component-based UI
JavaScript	Application logic	Browser-native implementation
Tailwind CSS	Styling	Efficient responsive UI development
PDF.js	PDF extraction	Processes PDF files locally in the browser
Transformers.js	ML inference	Runs embedding models in the browser
all-MiniLM-L6-v2	Embeddings	Lightweight semantic embedding model
WebLLM	LLM inference	Runs language models locally in browsers
SmolLM2-360M	LLM	Small model suitable for local inference
WebGPU	GPU acceleration	Accelerates local LLM execution
WebAssembly	Runtime	Enables efficient browser-side embedding inference
IndexedDB	Local storage	Persistent browser-side document data
Git	Version control	Tracks project changes
GitHub	Repository	Source-code hosting
GitHub Actions	CI/CD	Automates builds and deployment
GitHub Pages	Hosting	Static application hosting


📦 Main Dependencies
The main application dependencies include:
next
react
react-dom
pdfjs-dist
@huggingface/transformers
@mlc-ai/web-llm

Development tooling includes:
eslint
eslint-config-next
tailwindcss
@tailwindcss/turbopack
babel-plugin-react-compiler

📁 Project Structure
enterprise-document-ai/
│
├── .github/
│   └── workflows/
│       └── deploy.yml
│
├── app/
│   ├── page.js
│   ├── layout.js
│   └── globals.css
│
├── public/
│
├── next.config.mjs
├── package.json
├── package-lock.json
├── eslint.config.mjs
├── postcss.config.mjs
├── README.md
└── .gitignore

🚀 Run Locally
Requirements
Recommended:
- Node.js 24.x
- npm 11.x
- Google Chrome or Microsoft Edge
- WebGPU-capable hardware for local LLM inference
Clone
git clone https://github.com/venantiuscyra4/enterprise-document-ai.git

cd enterprise-document-ai

Install Dependencies
npm install

Start Development Server
npm run dev

Then open:
http://localhost:3000

Production Build
npm run build

The application is configured for static export.
The generated files are placed in:
out/

🧪 Example Workflow
Step 1
Open the application.
Step 2
Upload a PDF.
Step 3
The application performs:
PDF Extraction
      ↓
Chunking
      ↓
Embedding
      ↓
Indexing

Step 4
Ask a question.
Example:
What is the course title?

Step 5
The application performs:
Question
   ↓
Query Embedding
   ↓
Semantic Retrieval
   ↓
Lexical Retrieval
   ↓
Hybrid Ranking
   ↓
Evidence Gate
   ↓
WebLLM
   ↓
Grounded Answer
   ↓
Page Citation

📊 Evaluation Metrics
A RAG application should be evaluated using measurable metrics rather than only subjective answer quality.
Retrieval Recall@K
Measures whether relevant evidence appears among the top K retrieved chunks.
Recall@K =
Relevant Retrieved Evidence
────────────────────────────
Required Relevant Evidence

Precision@K
Measures how many retrieved chunks are actually relevant.
Precision@K =
Relevant Retrieved Chunks
────────────────────────
Retrieved Chunks

Mean Reciprocal Rank
MRR measures how highly the first relevant result appears.
MRR = Average(1 / Rank)

Answer Accuracy
Measures whether the final answer correctly answers the question.
Faithfulness
Measures whether generated claims are supported by retrieved document evidence.
Citation Accuracy
Measures whether cited pages actually support the corresponding claims.
Refusal Accuracy
Measures whether unsupported questions are correctly refused.
This is particularly important for a grounded document-Q&A system.
🧪 Grounding Test
Suppose a PDF contains:
Business Communication and Ethics

Question:
What is the course title?

The system should retrieve the relevant evidence and answer using the document.
Now ask:
What is karma?

If the uploaded document contains no information about karma, the system should not use the LLM's pretrained knowledge to generate a general explanation.
Expected behavior:
The information is not available in the provided document.

This demonstrates the purpose of evidence-gated generation.
⚠️ Limitations
Small Language Model
The current language model is:
SmolLM2-360M-Instruct

It is considerably smaller than large cloud-based language models.
Complex reasoning may therefore be weaker.
Hardware Requirements
Local inference depends on the user's device.
WebGPU support is recommended.
Older hardware may experience:
- slower inference
- GPU memory limitations
- model loading failures
- browser-specific limitations
Initial Model Loading
The first use can take longer because model assets need to be loaded and initialized.
PDF Extraction
Text-based PDFs work best.
Scanned image-only PDFs may require OCR functionality.
Large Documents
Large document collections can consume significant browser memory.
Retrieval Quality
Semantic retrieval is not perfect.
Ambiguous questions, tables, unusual terminology, and poorly structured PDFs can reduce retrieval quality.
🔮 Future Improvements
OCR
Add OCR support for scanned PDFs.
Improved Embeddings
Evaluate stronger browser-compatible embedding models.
Reranking
Add a reranking stage after initial retrieval.
Initial Retrieval
       ↓
Top 20 Chunks
       ↓
Reranker
       ↓
Top 5 Chunks

Approximate Nearest Neighbor Search
Introduce more efficient vector search for larger local document collections.
Advanced Citations
Add:
- clickable citations
- source excerpts
- page previews
- highlighted evidence
Evaluation Dashboard
Add evaluation for:
- Recall@K
- Precision@K
- MRR
- Answer Accuracy
- Faithfulness
- Citation Accuracy
- Refusal Accuracy
Larger Local Models
Allow users with capable hardware to select larger WebLLM models.
🔐 Security Considerations
The project intentionally avoids requiring:
- unknown executables
- system-level installers
- Administrator privileges
- disabling Windows Defender
- disabling browser security
- external AI API credentials
The application uses standard web technologies and npm packages.
💡 Why This Architecture?
This project demonstrates several concepts that are important for modern AI applications.
Browser-Native AI
Machine-learning components can execute directly inside modern browsers.
Privacy-First RAG
Documents can be processed locally rather than automatically uploaded to a backend.
Hybrid Retrieval
Combining semantic and lexical signals can improve retrieval robustness.
Evidence Gating
Generation should be preceded by evidence validation when the objective is document-grounded QA.
Local LLM Inference
WebLLM and WebGPU demonstrate that LLM inference can be performed locally on supported hardware.
Static Deployment
The application can be hosted as a static web application because its core processing is client-side.
🔄 Complete End-to-End Pipeline
                         USER PDF
                            │
                            ▼
                         PDF.js
                            │
                            ▼
                     Extracted Text
                            │
                            ▼
                  Sentence-Aware Chunks
                            │
                            ▼
                    Transformers.js
                            │
                            ▼
                    384-D Embeddings
                            │
                            ▼
                    Local Storage
                            │
                            │
                     USER QUESTION
                            │
                            ▼
                    Query Embedding
                            │
                            ▼
              ┌────────────────────────┐
              │   Hybrid Retrieval     │
              │                        │
              │ Semantic + Lexical     │
              └───────────┬────────────┘
                          │
                          ▼
                     Ranked Chunks
                          │
                          ▼
                     Evidence Gate
                          │
                    ┌─────┴─────┐
                    │           │
                Supported   Unsupported
                    │           │
                    ▼           ▼
                  WebLLM      Refusal
                    │
                    ▼
              Grounded Answer
                    │
                    ▼
               Page Citation

🎯 Project Objectives
The project was designed to demonstrate:
1. A complete browser-native RAG pipeline.
2. Client-side PDF processing.
3. Local embedding generation.
4. Hybrid semantic and lexical retrieval.
5. Evidence-gated generation.
6. Browser-based LLM inference.
7. WebGPU acceleration.
8. Page-level citations.
9. Privacy-first document processing.
10. Static web deployment without a traditional AI backend.
📌 Project Summary
Enterprise Document AI demonstrates how a complete Retrieval-Augmented Generation pipeline can be implemented directly in a modern web browser.
The complete architecture is:
PDF
 ↓
PDF.js
 ↓
Chunking
 ↓
Transformers.js
 ↓
Embeddings
 ↓
Hybrid Retrieval
 ↓
Evidence Gate
 ↓
WebLLM
 ↓
WebGPU
 ↓
Grounded Answer
 ↓
Page Citation

The project combines document processing, semantic search, local machine learning, retrieval, and generative AI into a single browser-native application.
👨‍💻 Author
Venantius Cyra S
GitHub:
https://github.com/venantiuscyra4
Repository:
https://github.com/venantiuscyra4/enterprise-document-ai
📜 License
This project is currently intended for educational, portfolio, and experimental purposes.
An open-source license can be added before unrestricted redistribution.
⭐ Acknowledgements
This project makes use of open-source technologies and models including:
- Next.js
- React
- Mozilla PDF.js
- Hugging Face Transformers.js
- Xenova/all-MiniLM-L6-v2
- MLC WebLLM
- SmolLM2
- WebGPU
- WebAssembly
- IndexedDB
- GitHub Actions
- GitHub Pages