
from app.services.rag_service import (
    build_document_index,
    ask_document_question
)


pdf_path = input("Enter your PDF path: ")

try:
    # Prepare the PDF
    print("\nProcessing your PDF...")

    document_index = build_document_index(pdf_path)

    print("\nDocument processed successfully!")
    print("Pages:", document_index["total_pages"])
    print("Chunks:", document_index["total_chunks"])

    # Ask questions repeatedly
    while True:

        question = input(
            "\nAsk a question (or type 'exit'): "
        )

        if question.strip().lower() == "exit":
            print("Closing CampusPilot AI chatbot.")
            break

        try:
            result = ask_document_question(
                question,
                document_index,
                top_k=3
            )

            print("\nCampusPilot AI Answer:")
            print(result["answer"])

            print("\nSources:")

            for source in result["sources"]:
                print(
                    f"Page {source['page_number']} "
                    f"(similarity: {source['similarity']:.3f})"
                )

        except Exception as error:
            print("\nQuestion error:", error)

except Exception as error:
    print("\nDocument processing error:", error)
