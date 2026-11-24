
from app.services.pdf_service import (
    extract_text_from_pdf,
    chunk_pdf_pages
)

pdf_path = input("Enter the PDF file path: ")

try:
    # Step 1: Extract PDF text
    pages = extract_text_from_pdf(pdf_path)

    print("\nPDF extraction successful!")
    print("Total pages:", len(pages))

    # Step 2: Divide extracted text into chunks
    chunks = chunk_pdf_pages(
        pages,
        chunk_size=1000,
        overlap=200
    )

    print("\nChunking successful!")
    print("Total chunks:", len(chunks))

    # Step 3: Display the first few chunks
    for chunk in chunks[:5]:
        print("\n------------------------")
        print("Page:", chunk["page_number"])
        print("Chunk:", chunk["chunk_index"])
        print("Characters:", len(chunk["text"]))
        print("Text:")
        print(chunk["text"][:300])

except Exception as error:
    print("Error:", error)
