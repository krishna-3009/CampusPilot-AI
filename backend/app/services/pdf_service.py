
import pymupdf


def extract_text_from_pdf(pdf_path):
    """
    Extract text from every page of a PDF.
    Returns a list containing each page's text.
    """

    extracted_pages = []

    try:
        document = pymupdf.open(pdf_path)

        for page_number, page in enumerate(document, start=1):
            page_text = page.get_text("text")

            extracted_pages.append({
                "page_number": page_number,
                "text": page_text.strip()
            })

        document.close()

        return extracted_pages

    except Exception as error:
        raise ValueError(f"PDF extraction failed: {error}")

def chunk_pdf_pages(pages, chunk_size=1000, overlap=200):
    """
    Divide extracted PDF pages into smaller text chunks.

    Each chunk keeps its original page number.
    """

    if chunk_size <= 0:
        raise ValueError("Chunk size must be positive")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("Overlap must be non-negative and smaller than chunk size")

    chunks = []

    for page in pages:
        text = page["text"]
        page_number = page["page_number"]

        if not text.strip():
            continue

        start = 0
        chunk_index = 1

        while start < len(text):

            end = min(start + chunk_size, len(text))

            # Try to end at a word boundary
            if end < len(text):
                boundary = text.rfind(" ", start + chunk_size // 2, end)

                if boundary > start:
                    end = boundary

            chunk_text = text[start:end].strip()

            if chunk_text:
                chunks.append({
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "text": chunk_text
                })

                chunk_index += 1

            if end >= len(text):
                break

            # Move forward while retaining some overlapping text
            start = end - overlap

    return chunks

