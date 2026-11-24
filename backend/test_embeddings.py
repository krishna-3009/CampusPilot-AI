
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


pdf_path = input("Enter your PDF path: ")

try:
    # 1. Extract text
    pages = extract_text_from_pdf(pdf_path)

    # 2. Create chunks
    chunks = chunk_pdf_pages(
        pages,
        chunk_size=1000,
        overlap=200
    )

    if not chunks:
        raise ValueError("No text chunks found in PDF")

    # 3. Collect chunk text
    texts = [
        chunk["text"]
        for chunk in chunks
    ]

    # 4. Generate embeddings
    embeddings = generate_embeddings(texts)

    print("\nEmbedding generation successful!")
    print("Total embeddings:", len(embeddings))
    print("Vector dimensions:", embeddings.shape[1])

    # 5. Create FAISS index
    index = create_faiss_index(embeddings)

    print("\nFAISS index created successfully!")

    # 6. Ask a question
    query = input("\nAsk a question about your PDF: ")

    results = search_similar_chunks(
        query,
        model,
        index,
        chunks,
        top_k=3
    )

    # 7. Display matching chunks
    print("\nMost relevant results:")

    for result in results:
        print("\n------------------------")
        print("Similarity:", round(result["score"], 4))
        print("Page:", result["chunk"]["page_number"])
        print("Text:", result["chunk"]["text"][:500])

except Exception as error:
    print("\nError:", error)
