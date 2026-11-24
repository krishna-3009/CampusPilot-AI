
from app.services.pdf_service import (
    extract_text_from_pdf,
    chunk_pdf_pages
)

from app.services.embedding_service import (
    model,
    generate_embeddings
)

from app.services.vector_service import (
    create_faiss_index,
    search_similar_chunks
)

from app.services.gemini_service import (
    generate_answer,
    generate_answer_stream
)


def build_document_index(pdf_path):
    """
    Extract PDF text, create chunks, generate embeddings,
    and build a FAISS index.
    """

    # 1. Extract text page by page
    pages = extract_text_from_pdf(pdf_path)

    # 2. Divide text into chunks
    chunks = chunk_pdf_pages(
        pages,
        chunk_size=1000,
        overlap=200
    )

    if not chunks:
        raise ValueError(
            "No extractable text found in this PDF"
        )

    # 3. Generate embeddings
    texts = [
        chunk["text"]
        for chunk in chunks
    ]

    embeddings = generate_embeddings(texts)

    # 4. Create FAISS index
    index = create_faiss_index(embeddings)

    return {
        "index": index,
        "chunks": chunks,
        "total_pages": len(pages),
        "total_chunks": len(chunks)
    }


def prepare_document_question(question, document_index, top_k=3):
    """
    Retrieve relevant chunks and prepare Gemini context and page sources.
    """

    if not question.strip():
        raise ValueError("Question cannot be empty")

    index = document_index["index"]
    chunks = document_index["chunks"]

    # 1. Retrieve relevant chunks
    results = search_similar_chunks(
        question,
        model,
        index,
        chunks,
        top_k=top_k
    )

    if not results:
        raise ValueError("No relevant document content found")

    # 2. Prepare context for Gemini
    context_parts = []

    for result in results:
        chunk = result["chunk"]

        context_parts.append(
            f"""
[Source: Page {chunk['page_number']}]

{chunk['text']}
"""
        )

    context = "\n".join(context_parts)

    # 3. Collect source information
    sources = []

    seen = set()

    for result in results:
        chunk = result["chunk"]
        page_number = chunk["page_number"]

        if page_number not in seen:
            sources.append({
                "page_number": page_number,
                "similarity": result["score"]
            })
            seen.add(page_number)

    return context, sources


def ask_document_question(question, document_index, top_k=3):
    """Retrieve relevant chunks and generate a grounded answer."""
    context, sources = prepare_document_question(
        question,
        document_index,
        top_k=top_k
    )
    answer = generate_answer(question, context)

    return {
        "answer": answer,
        "sources": sources
    }


def stream_document_question(question, context):
    """Yield answer text chunks from Gemini."""
    yield from generate_answer_stream(question, context)
