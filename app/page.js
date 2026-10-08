"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.worker.min.mjs";

/* =========================================================
   CONFIGURATION
========================================================= */

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

const LLM_MODEL =
  "SmolLM2-360M-Instruct-q4f32_1-MLC";

const MIN_SIMILARITY = 0.30;

const MAX_PDF_SIZE_MB = 25;

const DB_NAME = "enterprise-document-ai";

const DB_VERSION = 1;

const STORE_NAME = "documents";

/* =========================================================
   INDEXEDDB
========================================================= */

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(
        new Error(
          "Browser storage is unavailable."
        )
      );
      return;
    }

    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function saveDocument(document) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STORE_NAME)
      .put(document);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function loadDocuments() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const request =
      transaction
        .objectStore(STORE_NAME)
        .getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function removeDocumentFromDB(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STORE_NAME)
      .delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function clearDocumentsFromDB() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    transaction
      .objectStore(STORE_NAME)
      .clear();

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/* =========================================================
   TEXT NORMALIZATION
========================================================= */

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   TEXT SIMILARITY
========================================================= */

function textSimilarity(textA, textB) {
  const wordsA = new Set(
    normalizeText(textA)
      .split(" ")
      .filter(Boolean)
  );

  const wordsB = new Set(
    normalizeText(textB)
      .split(" ")
      .filter(Boolean)
  );

  if (
    wordsA.size === 0 ||
    wordsB.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  const union = new Set([
    ...wordsA,
    ...wordsB,
  ]).size;

  return union === 0
    ? 0
    : intersection / union;
}

/* =========================================================
   REMOVE DUPLICATE RESULTS
========================================================= */

function removeDuplicateResults(results) {
  const filtered = [];

  for (const result of results) {
    const duplicate = filtered.some(
      (existing) =>
        textSimilarity(
          existing.text,
          result.text
        ) > 0.65
    );

    if (!duplicate) {
      filtered.push(result);
    }
  }

  return filtered;
}

/* =========================================================
   DETECT BROAD QUESTIONS
========================================================= */

function isBroadQuestion(query) {
  const text =
    normalizeText(query);

  const broadPatterns = [
    "explain the pdf",
    "explain this pdf",
    "explain the document",
    "explain this document",
    "explain the file",
    "explain this file",
    "summarize the pdf",
    "summarize this pdf",
    "summarize the document",
    "summarize this document",
    "summarize the file",
    "summarize this file",
    "summary of the pdf",
    "summary of the document",
    "summary of the file",
    "give me a summary",
    "give me an overview",
    "overview of the document",
    "overview of the pdf",
    "what is this document about",
    "what is this pdf about",
    "what is this file about",
    "tell me about this document",
    "tell me about this pdf",
    "tell me about this file",
    "describe the document",
    "describe the pdf",
    "describe the file",
    "key points",
    "main points",
    "important points",
    "key topics",
    "main topics",
    "important topics",
    "what are the key ideas",
    "what are the main ideas",
  ];

  return broadPatterns.some(
    (pattern) =>
      text.includes(pattern)
  );
}

/* =========================================================
   PDF EXTRACTION
========================================================= */

async function extractPDF(file) {
  const buffer =
    await file.arrayBuffer();

  const pdf =
    await pdfjsLib
      .getDocument({
        data: buffer,
      })
      .promise;

  const pages = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    const page =
      await pdf.getPage(pageNumber);

    const textContent =
      await page.getTextContent();

    const text =
      textContent.items
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    pages.push({
      pageNumber,
      text,
    });
  }

  return {
    pageCount: pdf.numPages,
    pages,
  };
}

/* =========================================================
   SENTENCE-AWARE CHUNKING
========================================================= */

function createChunks(
  pages,
  targetSize = 800,
  overlapSize = 120
) {
  const chunks = [];

  for (const page of pages) {
    if (!page.text) {
      continue;
    }

    const text =
      page.text
        .replace(/\s+/g, " ")
        .trim();

    if (!text) {
      continue;
    }

    const sentences =
      text.match(
        /[^.!?]+[.!?]+|[^.!?]+$/g
      ) || [text];

    let currentChunk = "";

    for (const sentence of sentences) {
      const cleanSentence =
        sentence.trim();

      if (!cleanSentence) {
        continue;
      }

      const proposed =
        currentChunk.length === 0
          ? cleanSentence
          : `${currentChunk} ${cleanSentence}`;

      if (
        proposed.length <= targetSize ||
        currentChunk.length === 0
      ) {
        currentChunk = proposed;
        continue;
      }

      chunks.push({
        id: chunks.length,
        pageNumber: page.pageNumber,
        text: currentChunk.trim(),
      });

      const overlapText =
        currentChunk.length >
        overlapSize
          ? currentChunk.slice(
              -overlapSize
            )
          : currentChunk;

      currentChunk =
        `${overlapText} ${cleanSentence}`.trim();
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: chunks.length,
        pageNumber: page.pageNumber,
        text: currentChunk.trim(),
      });
    }
  }

  return chunks;
}

/* =========================================================
   COSINE SIMILARITY
========================================================= */

function cosineSimilarity(
  vectorA,
  vectorB
) {
  if (
    !vectorA ||
    !vectorB ||
    vectorA.length !== vectorB.length
  ) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (
    let i = 0;
    i < vectorA.length;
    i++
  ) {
    dotProduct +=
      vectorA[i] * vectorB[i];

    magnitudeA +=
      vectorA[i] * vectorA[i];

    magnitudeB +=
      vectorB[i] * vectorB[i];
  }

  if (
    magnitudeA === 0 ||
    magnitudeB === 0
  ) {
    return 0;
  }

  return (
    dotProduct /
    (Math.sqrt(magnitudeA) *
      Math.sqrt(magnitudeB))
  );
}

/* =========================================================
   MAIN APPLICATION
========================================================= */

export default function Home() {
  const [documents, setDocuments] =
    useState([]);

  const [
    selectedDocumentIds,
    setSelectedDocumentIds,
  ] = useState([]);

  const [question, setQuestion] =
    useState("");

  const [messages, setMessages] =
    useState([]);

  const [sources, setSources] =
    useState([]);

  const [processing, setProcessing] =
    useState(false);

  const [
    processingStatus,
    setProcessingStatus,
  ] = useState("");

  const [
    processingProgress,
    setProcessingProgress,
  ] = useState(0);

  const [answering, setAnswering] =
    useState(false);

  const [
    embeddingStatus,
    setEmbeddingStatus,
  ] = useState("Not loaded");

  const [llmStatus, setLlmStatus] =
    useState("Not loaded");

  const [llmProgress, setLlmProgress] =
    useState(0);

  const [error, setError] =
    useState("");

  const [showSources, setShowSources] =
    useState(false);

  const [webGPUAvailable, setWebGPUAvailable] =
    useState(false);

  const embedderRef = useRef(null);

  const llmRef = useRef(null);

  const chatEndRef = useRef(null);

  /* =======================================================
     INITIALIZE
  ======================================================= */

  useEffect(() => {
    async function initialize() {
      try {
        const stored =
          await loadDocuments();

        setDocuments(stored);

        setSelectedDocumentIds(
          stored.map(
            (document) => document.id
          )
        );
      } catch (err) {
        console.error(err);

        setError(
          "Unable to load documents from browser storage."
        );
      }

      if (
        typeof navigator !==
          "undefined" &&
        navigator.gpu
      ) {
        setWebGPUAvailable(true);
      }
    }

    initialize();
  }, []);

  /* =======================================================
     CHAT AUTO-SCROLL
  ======================================================= */

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, answering]);

  /* =======================================================
     EMBEDDING MODEL
  ======================================================= */

  async function getEmbedder() {
    if (embedderRef.current) {
      return embedderRef.current;
    }

    setEmbeddingStatus(
      "Loading embedding model..."
    );

    const { pipeline } =
      await import(
        "@huggingface/transformers"
      );

    const embedder =
      await pipeline(
        "feature-extraction",
        EMBEDDING_MODEL,
        {
          device: "wasm",
          dtype: "q8",
        }
      );

    embedderRef.current =
      embedder;

    setEmbeddingStatus("Ready");

    return embedder;
  }

  /* =======================================================
     GENERATE EMBEDDING
  ======================================================= */

  async function embedText(
    embedder,
    text
  ) {
    const output =
      await embedder(text, {
        pooling: "mean",
        normalize: true,
      });

    return Array.from(
      output.data
    );
  }

  /* =======================================================
     PROCESS PDF
  ======================================================= */

  async function processPDF(file) {
    if (!file) {
      return;
    }

    if (
      !file.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      throw new Error(
        "Only PDF files are supported."
      );
    }

    const sizeMB =
      file.size /
      (1024 * 1024);

    if (
      sizeMB > MAX_PDF_SIZE_MB
    ) {
      throw new Error(
        `PDF files must be smaller than ${MAX_PDF_SIZE_MB} MB.`
      );
    }

    setProcessing(true);

    setProcessingProgress(5);

    setProcessingStatus(
      `Reading ${file.name}...`
    );

    try {
      const {
        pageCount,
        pages,
      } = await extractPDF(file);

      setProcessingProgress(25);

      setProcessingStatus(
        `Creating chunks from ${pageCount} pages...`
      );

      const chunks =
        createChunks(pages);

      if (!chunks.length) {
        throw new Error(
          "No readable text was found in this PDF. It may be a scanned/image-only PDF."
        );
      }

      setProcessingProgress(35);

      setProcessingStatus(
        "Loading embedding model..."
      );

      const embedder =
        await getEmbedder();

      const embeddings = [];

      for (
        let i = 0;
        i < chunks.length;
        i++
      ) {
        const vector =
          await embedText(
            embedder,
            chunks[i].text
          );

        embeddings.push({
          chunkId: chunks[i].id,
          pageNumber:
            chunks[i].pageNumber,
          text: chunks[i].text,
          vector,
        });

        const progress =
          35 +
          Math.round(
            ((i + 1) /
              chunks.length) *
              60
          );

        setProcessingProgress(
          progress
        );

        setProcessingStatus(
          `Embedding chunk ${i + 1} of ${chunks.length}...`
        );
      }

      const document = {
        id: crypto.randomUUID(),

        name: file.name,

        pageCount,

        chunkCount:
          chunks.length,

        createdAt:
          new Date().toISOString(),

        chunks,

        embeddings,
      };

      await saveDocument(
        document
      );

      setDocuments(
        (previous) => [
          ...previous,
          document,
        ]
      );

      setSelectedDocumentIds(
        (previous) => [
          ...previous,
          document.id,
        ]
      );

      setProcessingProgress(100);

      setProcessingStatus(
        `${file.name} is ready.`
      );
    } finally {
      setProcessing(false);
    }
  }

  /* =======================================================
     FILE UPLOAD
  ======================================================= */

  async function handleUpload(
    event
  ) {
    const files = Array.from(
      event.target.files || []
    );

    if (!files.length) {
      return;
    }

    setError("");

    try {
      for (const file of files) {
        await processPDF(file);
      }
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to process the PDF."
      );
    } finally {
      event.target.value = "";
    }
  }

  /* =======================================================
     DELETE DOCUMENT
  ======================================================= */

  async function handleDeleteDocument(
    id
  ) {
    const document =
      documents.find(
        (item) => item.id === id
      );

    if (!document) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${document.name}" from this browser?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await removeDocumentFromDB(
        id
      );

      setDocuments(
        (previous) =>
          previous.filter(
            (item) =>
              item.id !== id
          )
      );

      setSelectedDocumentIds(
        (previous) =>
          previous.filter(
            (item) => item !== id
          )
      );
    } catch (err) {
      console.error(err);

      setError(
        "Unable to delete the document."
      );
    }
  }

  /* =======================================================
     CLEAR DOCUMENTS
  ======================================================= */

  async function handleClearDocuments() {
    const confirmed =
      window.confirm(
        "Delete all documents stored in this browser?"
      );

    if (!confirmed) {
      return;
    }

    try {
      await clearDocumentsFromDB();

      setDocuments([]);

      setSelectedDocumentIds([]);

      setMessages([]);

      setSources([]);
    } catch (err) {
      console.error(err);

      setError(
        "Unable to clear browser storage."
      );
    }
  }

  /* =======================================================
     RETRIEVE ALL EMBEDDINGS
  ======================================================= */

  function getActiveDocuments() {
    return documents.filter(
      (document) =>
        selectedDocumentIds.includes(
          document.id
        )
    );
  }

  /* =======================================================
     BROAD QUESTION RETRIEVAL
     
     For "Explain the PDF", retrieve
     representative chunks from each page.
  ======================================================= */

  function getBroadDocumentResults(
    activeDocuments,
    scoredChunks
  ) {
    const results = [];

    for (const document of activeDocuments) {
      const documentChunks =
        scoredChunks
          .filter(
            (item) =>
              item.documentId ===
              document.id
          )
          .sort(
            (a, b) =>
              b.score - a.score
          );

      /*
       * Group chunks by page.
       */
      const pageGroups =
        new Map();

      for (const chunk of documentChunks) {
        if (
          !pageGroups.has(
            chunk.pageNumber
          )
        ) {
          pageGroups.set(
            chunk.pageNumber,
            []
          );
        }

        pageGroups
          .get(chunk.pageNumber)
          .push(chunk);
      }

      /*
       * Take the best chunk from each page.
       * This prevents a summary from focusing
       * entirely on one page.
       */
      for (const [
        pageNumber,
        pageChunks,
      ] of pageGroups.entries()) {
        const best =
          pageChunks[0];

        results.push({
          ...best,
          pageNumber,
          documentId:
            document.id,
          documentName:
            document.name,
        });
      }
    }

    /*
     * Rank representative page chunks
     * by semantic relevance.
     */
    return results
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 12);
  }

  /* =======================================================
     RETRIEVAL
  ======================================================= */

  async function retrieve(query) {
    const activeDocuments =
      getActiveDocuments();

    if (!activeDocuments.length) {
      return [];
    }

    const embedder =
      await getEmbedder();

    const queryVector =
      await embedText(
        embedder,
        query
      );

    const allEmbeddings =
      activeDocuments.flatMap(
        (document) =>
          (document.embeddings ||
            []).map(
            (item) => ({
              ...item,

              documentId:
                document.id,

              documentName:
                document.name,
            })
          )
      );

    const scored =
      allEmbeddings
        .map((item) => ({
          ...item,

          score:
            cosineSimilarity(
              queryVector,
              item.vector
            ),
        }))
        .sort(
          (a, b) =>
            b.score - a.score
        );

    /* =====================================================
       BROAD DOCUMENT QUESTION
    ===================================================== */

    if (isBroadQuestion(query)) {
      const broadResults =
        getBroadDocumentResults(
          activeDocuments,
          scored
        );

      return broadResults.map(
        (item, index) => ({
          ...item,

          sourceNumber:
            index + 1,
        })
      );
    }

    /* =====================================================
       SPECIFIC QUESTION
    ===================================================== */

    const candidates =
      scored.slice(0, 10);

    const unique =
      removeDuplicateResults(
        candidates
      );

    return unique
      .filter(
        (item) =>
          item.score >=
          MIN_SIMILARITY
      )
      .slice(0, 4)
      .map(
        (item, index) => ({
          ...item,

          sourceNumber:
            index + 1,
        })
      );
  }

  /* =======================================================
     WEBLLM
  ======================================================= */

  async function getLLM() {
    if (llmRef.current) {
      return llmRef.current;
    }

    if (
      typeof navigator ===
        "undefined" ||
      !navigator.gpu
    ) {
      throw new Error(
        "WebGPU is not available. Please use a recent version of Chrome or Edge."
      );
    }

    setLlmStatus(
      "Loading browser AI model..."
    );

    setLlmProgress(0);

    const {
      CreateMLCEngine,
    } = await import(
      "@mlc-ai/web-llm"
    );

    const engine =
      await CreateMLCEngine(
        LLM_MODEL,
        {
          initProgressCallback:
            (progress) => {
              const percentage =
                typeof progress?.progress ===
                "number"
                  ? Math.round(
                      progress.progress *
                        100
                    )
                  : 0;

              setLlmProgress(
                percentage
              );

              setLlmStatus(
                progress?.text ||
                  `Loading AI model ${percentage}%`
              );
            },
        }
      );

    llmRef.current =
      engine;

    setLlmProgress(100);

    setLlmStatus("Ready");

    return engine;
  }

  /* =======================================================
     ASK QUESTION
  ======================================================= */

  async function askQuestion() {
    const query =
      question.trim();

    if (
      !query ||
      answering
    ) {
      return;
    }

    if (
      selectedDocumentIds.length ===
      0
    ) {
      setError(
        "Please upload and select at least one document."
      );

      return;
    }

    setError("");

    setQuestion("");

    const userMessage = {
      role: "user",
      content: query,
    };

    setMessages(
      (previous) => [
        ...previous,
        userMessage,
      ]
    );

    setAnswering(true);

    try {
      const broad =
        isBroadQuestion(query);

      setLlmStatus(
        broad
          ? "Reading relevant document sections..."
          : "Searching documents..."
      );

      const results =
        await retrieve(query);

      setSources(results);

      if (!results.length) {
        setMessages(
          (previous) => [
            ...previous,
            {
              role: "assistant",

              content:
                "The information is not available in the provided document.",

              sources: [],
            },
          ]
        );

        return;
      }

      const context =
        results
          .map(
            (result) =>
              `[Source ${result.sourceNumber}]
Document: ${result.documentName}
Page: ${result.pageNumber}
Similarity: ${result.score.toFixed(4)}

${result.text}`
          )
          .join(
            "\n\n------------------------------\n\n"
          );

      const engine =
        await getLLM();

      setLlmStatus(
        broad
          ? "Generating document explanation..."
          : "Generating grounded answer..."
      );

      const recentMessages =
        messages
          .slice(-4)
          .map((message) => ({
            role:
              message.role,
            content:
              message.content,
          }));

      const systemPrompt = `
You are a precise enterprise document question-answering assistant.

The supplied DOCUMENT SOURCES are your only source of truth.

STRICT GROUNDING RULES:

1. Do not use outside knowledge.
2. Do not guess.
3. Do not invent facts.
4. Do not claim something is in the document unless it is supported by the supplied sources.
5. Preserve names, titles, codes, dates, numbers and important terminology accurately.
6. Keep different fields separate.
7. Do not repeat sentences.
8. Do not fabricate missing information.
9. Cite relevant page numbers using (Page X).

QUESTION TYPE:

${
  broad
    ? `The user is asking for a broad explanation or summary.

Use the supplied sources to synthesize the document into a useful explanation.

Identify:
- what the document is about
- its main topics
- important concepts
- important details
- major points that are actually supported by the sources

Use concise bullet points when appropriate.

Do NOT answer with only "The information is not available..." merely because the question is broad.`
    : `The user is asking a specific document question.

Answer the specific question directly using only supported information.`
}

If the supplied sources genuinely do not contain enough information to answer the question, respond exactly:

"The information is not available in the provided document."

DOCUMENT SOURCES:

${context}
`;

      const response =
        await engine.chat.completions.create(
          {
            messages: [
              {
                role: "system",
                content:
                  systemPrompt,
              },

              ...recentMessages,

              {
                role: "user",
                content: query,
              },
            ],

            temperature: 0.1,

            top_p: 0.9,

            repetition_penalty: 1.15,

            frequency_penalty: 0.1,

            presence_penalty: 0.05,

            max_tokens: broad
              ? 350
              : 180,
          }
        );

      let answer =
        response
          ?.choices?.[0]
          ?.message?.content
          ?.trim();

      if (!answer) {
        answer =
          "The information is not available in the provided document.";
      }

      setMessages(
        (previous) => [
          ...previous,
          {
            role: "assistant",

            content: answer,

            sources: results,
          },
        ]
      );

      setLlmStatus("Ready");
    } catch (err) {
      console.error(
        "Document Q&A error:",
        err
      );

      /*
       * If WebGPU loses the device,
       * reset the engine reference so
       * the next attempt can reload it.
       */
      llmRef.current = null;

      setLlmStatus(
        "AI model needs to reload."
      );

      const errorMessage =
        err?.message ||
        "Unable to generate an answer.";

      if (
        errorMessage.includes(
          "Device was lost"
        ) ||
        errorMessage.includes(
          "already been disposed"
        )
      ) {
        setError(
          "The browser GPU ran out of resources. Please use the smaller local model, close GPU-heavy browser tabs, and try again."
        );
      } else {
        setError(errorMessage);
      }
    } finally {
      setAnswering(false);
    }
  }

  /* =======================================================
     KEYBOARD
  ======================================================= */

  function handleKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      askQuestion();
    }
  }

  /* =======================================================
     CLEAR CHAT
  ======================================================= */

  function clearChat() {
    setMessages([]);

    setSources([]);

    setError("");
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Enterprise Document AI
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Private browser-native RAG
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`rounded-full border px-3 py-2 text-xs ${
                webGPUAvailable
                  ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
                  : "border-red-800 bg-red-950/30 text-red-300"
              }`}
            >
              {webGPUAvailable
                ? "WebGPU Ready"
                : "WebGPU Unavailable"}
            </div>

            <div className="hidden rounded-full border border-slate-800 px-3 py-2 text-xs text-slate-500 sm:block">
              No API Key
            </div>
          </div>
        </div>
      </header>

      {/* ===================================================
          MAIN
      =================================================== */}

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            <div className="font-medium">
              Error
            </div>

            <div className="mt-1">
              {error}
            </div>
          </div>
        )}

        {/* STATS */}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Documents"
            value={
              documents.length
            }
          />

          <Stat
            label="Selected"
            value={
              selectedDocumentIds.length
            }
          />

          <Stat
            label="Retrieval Threshold"
            value={MIN_SIMILARITY.toFixed(
              2
            )}
          />
        </div>

        {/* MAIN GRID */}

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* =================================================
              SIDEBAR
          ================================================= */}

          <aside className="space-y-5">
            {/* DOCUMENTS */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">
                    Documents
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Stored locally
                  </p>
                </div>
              </div>

              <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950 px-4 py-8 text-center transition hover:border-orange-500">
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  className="hidden"
                  onChange={
                    handleUpload
                  }
                  disabled={processing}
                />

                <span className="text-sm font-semibold">
                  + Upload PDF
                </span>

                <span className="mt-1 text-xs text-slate-600">
                  Multiple PDFs supported
                </span>
              </label>

              <div className="mt-5 space-y-2">
                {documents.length ===
                0 ? (
                  <p className="text-xs text-slate-600">
                    No documents uploaded.
                  </p>
                ) : (
                  documents.map(
                    (document) => {
                      const selected =
                        selectedDocumentIds.includes(
                          document.id
                        );

                      return (
                        <div
                          key={
                            document.id
                          }
                          className={`rounded-xl border p-3 ${
                            selected
                              ? "border-orange-500/40 bg-orange-500/5"
                              : "border-slate-800 bg-slate-950"
                          }`}
                        >
                          <div className="flex gap-2">
                            <input
                              type="checkbox"
                              checked={
                                selected
                              }
                              onChange={() =>
                                setSelectedDocumentIds(
                                  (
                                    previous
                                  ) =>
                                    previous.includes(
                                      document.id
                                    )
                                      ? previous.filter(
                                          (
                                            id
                                          ) =>
                                            id !==
                                            document.id
                                        )
                                      : [
                                          ...previous,
                                          document.id,
                                        ]
                                )
                              }
                              className="mt-1 accent-orange-500"
                            />

                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm"
                                title={
                                  document.name
                                }
                              >
                                {
                                  document.name
                                }
                              </div>

                              <div className="mt-1 text-xs text-slate-600">
                                {
                                  document.pageCount
                                }{" "}
                                pages ·{" "}
                                {
                                  document.chunkCount
                                }{" "}
                                chunks
                              </div>
                            </div>

                            <button
                              onClick={() =>
                                handleDeleteDocument(
                                  document.id
                                )
                              }
                              className="text-slate-600 hover:text-red-400"
                              title="Delete"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )
                )}
              </div>

              {documents.length >
                0 && (
                <button
                  onClick={
                    handleClearDocuments
                  }
                  className="mt-4 w-full rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-400 hover:bg-red-950/30"
                >
                  Clear all documents
                </button>
              )}
            </section>

            {/* SYSTEM */}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="font-semibold">
                System Status
              </h2>

              <Status
                label="Embeddings"
                value={
                  embeddingStatus
                }
              />

              <Status
                label="Local AI"
                value={llmStatus}
              />

              <Status
                label="WebGPU"
                value={
                  webGPUAvailable
                    ? "Available"
                    : "Unavailable"
                }
              />
            </section>

            {/* PROCESSING */}

            {processing && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Processing
                  </span>

                  <span className="text-xs text-slate-500">
                    {
                      processingProgress
                    }
                    %
                  </span>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {
                    processingStatus
                  }
                </p>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-orange-500 transition-all"
                    style={{
                      width: `${processingProgress}%`,
                    }}
                  />
                </div>
              </section>
            )}

            {/* MODEL */}

            {llmProgress > 0 &&
              llmProgress < 100 && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Browser AI
                    </span>

                    <span className="text-xs text-slate-500">
                      {llmProgress}%
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    {llmStatus}
                  </p>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-orange-500 transition-all"
                      style={{
                        width: `${llmProgress}%`,
                      }}
                    />
                  </div>
                </section>
              )}
          </aside>

          {/* =================================================
              CHAT
          ================================================= */}

          <section className="flex min-h-[700px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {/* CHAT HEADER */}

            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <div>
                <h2 className="font-semibold">
                  Document Chat
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Ask questions or request a
                  document summary
                </p>
              </div>

              <div className="flex gap-2">
                {sources.length >
                  0 && (
                  <button
                    onClick={() =>
                      setShowSources(
                        !showSources
                      )
                    }
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
                  >
                    {showSources
                      ? "Hide Sources"
                      : "Sources"}
                  </button>
                )}

                {messages.length >
                  0 && (
                  <button
                    onClick={
                      clearChat
                    }
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* CHAT BODY */}

            <div className="flex-1 overflow-y-auto p-6">
              {messages.length ===
              0 ? (
                <div className="flex min-h-[500px] items-center justify-center text-center">
                  <div className="max-w-lg">
                    <div className="text-5xl">
                      ◈
                    </div>

                    <h3 className="mt-5 text-2xl font-semibold">
                      Ask your documents
                    </h3>

                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      Ask specific questions such as
                      "What is the course code?" or
                      broad questions such as
                      "Explain the PDF."
                    </p>

                    {documents.length ===
                      0 && (
                      <p className="mt-5 text-xs text-orange-400">
                        Upload a PDF to begin.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map(
                    (message, index) => (
                      <ChatMessage
                        key={index}
                        message={
                          message
                        }
                      />
                    )
                  )}

                  {answering && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-950 px-5 py-4 text-sm text-slate-500">
                        Reading the document
                        and generating an
                        answer...
                      </div>
                    </div>
                  )}

                  <div
                    ref={
                      chatEndRef
                    }
                  />
                </div>
              )}
            </div>

            {/* SOURCES */}

            {showSources &&
              sources.length >
                0 && (
                <div className="max-h-96 overflow-y-auto border-t border-slate-800 bg-slate-950 p-5">
                  <h3 className="font-semibold">
                    Retrieved Sources
                  </h3>

                  <div className="mt-4 space-y-3">
                    {sources.map(
                      (source) => (
                        <div
                          key={`${source.documentId}-${source.chunkId}`}
                          className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-xs font-medium text-slate-300">
                                Source{" "}
                                {
                                  source.sourceNumber
                                }
                              </span>

                              <div className="mt-1 text-xs text-orange-400">
                                {
                                  source.documentName
                                }{" "}
                                · Page{" "}
                                {
                                  source.pageNumber
                                }
                              </div>
                            </div>

                            <span className="text-xs text-slate-600">
                              Similarity{" "}
                              {source.score.toFixed(
                                4
                              )}
                            </span>
                          </div>

                          <p className="mt-3 text-xs leading-6 text-slate-500">
                            {
                              source.text
                            }
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

            {/* INPUT */}

            <div className="border-t border-slate-800 p-4">
              <div className="rounded-2xl border border-slate-700 bg-slate-950 p-2 focus-within:border-orange-500">
                <textarea
                  value={question}
                  onChange={(event) =>
                    setQuestion(
                      event.target.value
                    )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  disabled={
                    answering ||
                    selectedDocumentIds.length ===
                      0
                  }
                  rows={3}
                  placeholder={
                    selectedDocumentIds.length
                      ? "Ask about your documents..."
                      : "Upload and select a PDF first..."
                  }
                  className="w-full resize-none bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />

                <div className="flex items-center justify-between px-2 pb-1">
                  <span className="text-[11px] text-slate-700">
                    Enter to ask · Shift+Enter
                    for a new line
                  </span>

                  <button
                    onClick={
                      askQuestion
                    }
                    disabled={
                      answering ||
                      !question.trim() ||
                      selectedDocumentIds.length ===
                        0
                    }
                    className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {answering
                      ? "..."
                      : "Ask"}
                  </button>
                </div>
              </div>

              <p className="mt-2 text-center text-[11px] text-slate-700">
                PDF processing, embeddings,
                retrieval and AI inference run
                locally in your browser.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   STAT
========================================================= */

function Stat({
  label,
  value,
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold">
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   STATUS
========================================================= */

function Status({
  label,
  value,
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span className="max-w-[150px] truncate text-xs text-slate-300">
        {value}
      </span>
    </div>
  );
}

/* =========================================================
   CHAT MESSAGE
========================================================= */

function ChatMessage({
  message,
}) {
  const isUser =
    message.role === "user";

  return (
    <div
      className={`flex ${
        isUser
          ? "justify-end"
          : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-5 py-4 ${
          isUser
            ? "rounded-tr-sm bg-orange-500 text-white"
            : "rounded-tl-sm border border-slate-800 bg-slate-950 text-slate-300"
        }`}
      >
        <div className="whitespace-pre-wrap text-sm leading-7">
          {message.content}
        </div>

        {!isUser &&
          message.sources?.length >
            0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {message.sources.map(
                (source) => (
                  <span
                    key={`${source.documentId}-${source.chunkId}`}
                    className="rounded-full border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-500"
                  >
                    {source.documentName} ·
                    Page{" "}
                    {
                      source.pageNumber
                    }
                  </span>
                )
              )}
            </div>
          )}
      </div>
    </div>
  );
}
