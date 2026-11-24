
import faiss
import numpy as np


def create_faiss_index(embeddings):
    """
    Create a FAISS index from text embeddings.
    """

    embeddings = np.asarray(
        embeddings,
        dtype=np.float32
    )

    dimension = embeddings.shape[1]

    # Inner product index
    index = faiss.IndexFlatIP(dimension)

    # Store embeddings
    index.add(embeddings)

    return index


def search_similar_chunks(query, model, index, chunks, top_k=3):
    """
    Find the most relevant text chunks for a question.
    """

    query_embedding = model.encode(
        [query],
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    query_embedding = np.asarray(
        query_embedding,
        dtype=np.float32
    )

    scores, indices = index.search(query_embedding, top_k)

    results = []

    for score, chunk_index in zip(scores[0], indices[0]):

        if chunk_index == -1:
            continue

        results.append({
            "score": float(score),
            "chunk": chunks[chunk_index]
        })

    return results
